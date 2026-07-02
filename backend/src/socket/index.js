// src/socket/index.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import registerChatSocket from "./chat.socket.js";
import registerNotificationSocket from "./notification.socket.js";
import registerMeetingSocket from "./meeting.socket.js";

let ioInstance = null;

// Online users map: userId → Set<socketId>
const onlineUsers = new Map();

export const getIO = () => ioInstance;

export const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  ioInstance = io;

  // ─── Auth Middleware ────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      const user = await User.findById(decoded._id).select(
        "fullName email avatar role isActive"
      );

      if (!user) return next(new Error("User not found"));
      if (!user.isActive) return next(new Error("Account deactivated"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  // ─── Connection Handler ─────────────────────────────────────────────────────
  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();

    console.log(`🔌 Socket connected: ${socket.user.fullName} (${socket.id})`);

    // Update online status in DB
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
    }).catch(() => {});

    // ─── Register Feature Handlers ────────────────────────────────────────────
    // Each handler registers its own socket.on() events
    registerMeetingSocket(socket, io);
    registerChatSocket(socket, io);
    registerNotificationSocket(socket, io, onlineUsers);

    // ─── Team Room Events ─────────────────────────────────────────────────────
    // Handled here because Teams.jsx uses these directly
    // and they are not meeting/chat/notification specific

    socket.on("join-team", ({ teamId }) => {
      if (!teamId) return;
      socket.join(`team:${teamId}`);
      console.log(`👥 ${socket.user.fullName} joined team room: ${teamId}`);
    });

    socket.on("leave-team", ({ teamId }) => {
      if (!teamId) return;
      socket.leave(`team:${teamId}`);
    });

    // Shared notes broadcast (Teams.jsx)
    socket.on("edit-notes", ({ teamId, notes }) => {
      if (!teamId) return;
      socket.to(`team:${teamId}`).emit("notes-updated", notes);
    });

    // ─── Disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", async (reason) => {
      console.log(
        `🔴 Socket disconnected: ${socket.user.fullName} (${socket.id}) — ${reason}`
      );

      // Update offline status in DB
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      }).catch(() => {});

      // Note: Meeting disconnect is handled inside registerMeetingSocket
      // Note: Presence offline is handled inside registerNotificationSocket
    });
  });

  return io;
};