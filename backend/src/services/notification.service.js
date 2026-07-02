// src/services/notification.service.js
// FIX: CommonJS → ES Modules
// FIX: socket.init → getIO from socket/index.js

import Notification from "../models/Notification.js";

export const createNotification = async (options) => {
  const {
    recipient,
    sender = null,
    type,
    title,
    body = "",
    data = {},
    expiresAt = null,
    io,
  } = options;

  const notification = await Notification.create({
    recipient,
    sender,
    type,
    title,
    body,
    data,
    expiresAt,
  });

  // FIX: name → fullName
  await notification.populate("sender", "fullName avatar");

  if (io) {
    io.to(`user:${recipient.toString()}`).emit(
      "notification:new",
      notification
    );
  } else {
    try {
      // FIX: socket.init → socket/index.js
      const { getIO } = await import("../socket/index.js");
      const ioInstance = getIO();
      if (ioInstance) {
        ioInstance
          .to(`user:${recipient.toString()}`)
          .emit("notification:new", notification);
      }
    } catch (_) {}
  }

  return notification;
};

export const createBulkNotifications = async (recipients, baseOptions) => {
  const { io, ...rest } = baseOptions;

  const docs = recipients.map((r) => ({
    ...rest,
    recipient: r,
  }));

  const created = await Notification.insertMany(docs);

  try {
    const { getIO } = await import("../socket/index.js");
    const ioInstance = io || getIO();
    if (ioInstance) {
      recipients.forEach((r, i) => {
        ioInstance
          .to(`user:${r.toString()}`)
          .emit("notification:new", created[i]);
      });
    }
  } catch (_) {}

  return created;
};