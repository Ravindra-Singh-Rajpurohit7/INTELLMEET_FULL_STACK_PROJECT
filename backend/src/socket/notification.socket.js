// src/socket/notification.socket.js
// FIX: CommonJS → ES Modules
// Logic same — sirf module system change

import Notification from "../models/Notification.js";

export default function registerNotificationSocket(socket, io, onlineUsers) {
  const userId = socket.user._id.toString();

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);

  socket.broadcast.emit("presence:online", {
    userId,
    // FIX: socket.user.name → socket.user.fullName
    name: socket.user.fullName,
  });

  Notification.unreadCount(userId)
    .then((count) => socket.emit("notification:unread_count", { count }))
    .catch(() => {});

  socket.on("notification:read", async ({ notificationId }) => {
    try {
      await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { $set: { isRead: true, readAt: new Date() } }
      );
      const count = await Notification.unreadCount(userId);
      socket.emit("notification:unread_count", { count });
    } catch (err) {
      console.error("notification:read error:", err);
    }
  });

  socket.on("notification:read_all", async () => {
    try {
      await Notification.markAllRead(userId);
      socket.emit("notification:unread_count", { count: 0 });
    } catch (err) {
      console.error("notification:read_all error:", err);
    }
  });

  socket.on("disconnect", () => {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        setTimeout(() => {
          if (!onlineUsers.has(userId)) {
            io.emit("presence:offline", { userId });
          }
        }, 3000);
      }
    }
  });

  socket.on("presence:who_is_online", () => {
    const onlineIds = Array.from(onlineUsers.keys());
    socket.emit("presence:online_list", { userIds: onlineIds });
  });
}