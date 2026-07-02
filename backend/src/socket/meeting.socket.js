// src/socket/meeting.socket.js
import Meeting from "../models/Meeting.js";
import { createNotification } from "../services/notification.service.js";

/**
 * Registers all meeting-related socket events.
 * Called from socket/index.js after authentication.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
export default function registerMeetingSocket(socket, io) {
  const userId = socket.user._id.toString();
  const userName = socket.user.fullName;

  // ─── Join Meeting Room ──────────────────────────────────────────────────────
  /**
   * Client emits: join-room
   * Payload: { meetingId, userId, userName }
   */
  socket.on("join-room", async ({ meetingId, userId: uid, userName: uName }) => {
    try {
      if (!meetingId) return;

      // Verify meeting exists and is active
      const meeting = await Meeting.findOne({
        _id: meetingId,
        isActive: true,
      }).select("status host participants title settings");

      if (!meeting) {
        socket.emit("meeting:error", { message: "Meeting not found or inactive" });
        return;
      }

      if (meeting.status === "ended" || meeting.status === "cancelled") {
        socket.emit("meeting:error", {
          message: `Meeting has already ${meeting.status}`,
        });
        return;
      }

      // Join the socket room
      socket.join(`meeting:${meetingId}`);
      socket.currentMeeting = meetingId;
      socket.currentMeetingTitle = meeting.title;

      // Get all current participants in this socket room
      const roomSockets = await io.in(`meeting:${meetingId}`).fetchSockets();
      const currentParticipants = roomSockets
        .filter((s) => s.id !== socket.id)
        .map((s) => ({
          socketId: s.id,
          userId: s.user?._id?.toString(),
          userName: s.user?.fullName,
          avatar: s.user?.avatar,
        }));

      // Tell the joining user who is already in the room
      socket.emit("get-all-users", currentParticipants);

      // Tell everyone else that this user joined
      socket.to(`meeting:${meetingId}`).emit("user-connected", {
        socketId: socket.id,
        userId: uid || userId,
        userName: uName || userName,
        avatar: socket.user.avatar,
      });

      console.log(`👥 ${userName} joined meeting: ${meetingId}`);
    } catch (err) {
      console.error("[meeting:join-room] error:", err.message);
      socket.emit("meeting:error", { message: "Failed to join meeting room" });
    }
  });

  // ─── Leave Meeting Room ─────────────────────────────────────────────────────
  socket.on("leave-room", async () => {
    try {
      const meetingId = socket.currentMeeting;
      if (!meetingId) return;

      socket.to(`meeting:${meetingId}`).emit("user-disconnected", {
        socketId: socket.id,
        userId,
        userName,
      });

      socket.leave(`meeting:${meetingId}`);
      socket.currentMeeting = null;
      socket.currentMeetingTitle = null;

      console.log(`👋 ${userName} left meeting: ${meetingId}`);
    } catch (err) {
      console.error("[meeting:leave-room] error:", err.message);
    }
  });

  // ─── WebRTC Signaling ───────────────────────────────────────────────────────

  // Offer: Caller → Callee
  socket.on("offer", ({ target, offer }) => {
    io.to(target).emit("offer", {
      sender: socket.id,
      userId,
      userName,
      offer,
    });
  });

  // Answer: Callee → Caller
  socket.on("answer", ({ target, answer }) => {
    io.to(target).emit("answer", {
      sender: socket.id,
      userId,
      answer,
    });
  });

  // ICE Candidates exchange
  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", {
      sender: socket.id,
      candidate,
    });
  });

  // ─── Media Controls ─────────────────────────────────────────────────────────

  // Mute / Unmute audio
  socket.on("meeting:toggle-audio", ({ meetingId, isMuted }) => {
    socket.to(`meeting:${meetingId}`).emit("meeting:user-audio-changed", {
      socketId: socket.id,
      userId,
      userName,
      isMuted,
    });
  });

  // Camera on / off
  socket.on("meeting:toggle-video", ({ meetingId, isVideoOff }) => {
    socket.to(`meeting:${meetingId}`).emit("meeting:user-video-changed", {
      socketId: socket.id,
      userId,
      userName,
      isVideoOff,
    });
  });

  // Screen share started
  socket.on("meeting:screen-share-start", ({ meetingId }) => {
    socket.to(`meeting:${meetingId}`).emit("meeting:screen-sharing-started", {
      socketId: socket.id,
      userId,
      userName,
    });
  });

  // Screen share stopped
  socket.on("meeting:screen-share-stop", ({ meetingId }) => {
    socket.to(`meeting:${meetingId}`).emit("meeting:screen-sharing-stopped", {
      socketId: socket.id,
      userId,
    });
  });

  // ─── Meeting Lifecycle Events ───────────────────────────────────────────────

  // Host started the meeting
  socket.on("meeting:started", async ({ meetingId }) => {
    try {
      const meeting = await Meeting.findById(meetingId)
        .select("host title participants")
        .populate("participants", "_id");

      if (!meeting) return;

      // Only host can emit this
      if (!meeting.host.equals(userId)) return;

      io.to(`meeting:${meetingId}`).emit("meeting:host-started", {
        meetingId,
        startedBy: userId,
        startedAt: new Date(),
        title: meeting.title,
      });

      // Notify all participants
      if (meeting.participants?.length > 0) {
        const participantIds = meeting.participants
          .map((p) => p._id?.toString() || p.toString())
          .filter((id) => id !== userId);

        for (const participantId of participantIds) {
          await createNotification({
            recipient: participantId,
            sender: userId,
            type: "meeting_started",
            title: `Meeting "${meeting.title}" has started`,
            body: `${userName} has started the meeting. Join now!`,
            data: {
              entityType: "meeting",
              entityId: meeting._id,
            },
            io,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[meeting:started] error:", err.message);
    }
  });

  // Host ended the meeting
  socket.on("meeting:ended", async ({ meetingId }) => {
    try {
      const meeting = await Meeting.findById(meetingId).select("host title");
      if (!meeting) return;

      if (!meeting.host.equals(userId)) return;

      // Notify all in the room
      io.to(`meeting:${meetingId}`).emit("meeting:host-ended", {
        meetingId,
        endedBy: userId,
        endedAt: new Date(),
        title: meeting.title,
      });

      console.log(`🔚 Meeting ended by host: ${meetingId}`);
    } catch (err) {
      console.error("[meeting:ended] error:", err.message);
    }
  });

  // ─── In-Meeting Chat (Legacy — MeetingRoom.jsx compatibility) ───────────────
  // MeetingRoom.jsx uses: send-message, receive-message, typing, stop-typing

  socket.on("send-message", ({ meetingId, senderId, text }) => {
    const message = {
      senderId,
      senderName: userName,
      avatar: socket.user.avatar,
      text,
      createdAt: new Date(),
    };
    io.to(`meeting:${meetingId}`).emit("receive-message", message);
  });

  socket.on("typing", ({ meetingId, userName: typingUser }) => {
    socket.to(`meeting:${meetingId}`).emit("user-typing", {
      userId,
      userName: typingUser || userName,
    });
  });

  socket.on("stop-typing", ({ meetingId, userName: typingUser }) => {
    socket.to(`meeting:${meetingId}`).emit("user-stop-typing", {
      userId,
      userName: typingUser || userName,
    });
  });

  // ─── AI Processing Notifications ────────────────────────────────────────────

  // AI summary ready — broadcast to all meeting participants
  socket.on("ai:processing-complete", ({ meetingId, summary, tasksCreated, actionItems }) => {
    io.to(`meeting:${meetingId}`).emit("ai:processing-complete", {
      meetingId,
      summary,
      tasksCreated,
      actionItems,
      processedAt: new Date(),
    });
  });

  socket.on("ai:processing-failed", ({ meetingId, error }) => {
    io.to(`meeting:${meetingId}`).emit("ai:processing-failed", {
      meetingId,
      error,
      failedAt: new Date(),
    });
  });

  // ─── Disconnect Cleanup ─────────────────────────────────────────────────────

  socket.on("disconnect", () => {
    const meetingId = socket.currentMeeting;
    if (meetingId) {
      socket.to(`meeting:${meetingId}`).emit("user-disconnected", {
        socketId: socket.id,
        userId,
        userName,
      });
      console.log(
        `🔴 ${userName} disconnected from meeting: ${meetingId}`
      );
    }
  });
}