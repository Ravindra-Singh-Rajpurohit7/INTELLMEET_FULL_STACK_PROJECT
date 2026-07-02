// src/socket/chat.socket.js
// FIX: CommonJS → ES Modules
// FIX: name → fullName in all populate calls
// FIX: socket.user.name → socket.user.fullName

import Message from "../models/Message.js";
import { createNotification } from "../services/notification.service.js";

export default function registerChatSocket(socket, io) {
  const userId = socket.user._id.toString();

  socket.join(`user:${userId}`);

  socket.on("chat:join", ({ chatType, roomId }) => {
    if (!roomId) return;
    socket.join(`${chatType}:${roomId}`);
    socket.emit("chat:joined", { room: `${chatType}:${roomId}` });
  });

  socket.on("chat:leave", ({ chatType, roomId }) => {
    socket.leave(`${chatType}:${roomId}`);
  });

  socket.on("chat:message", async (payload, ack) => {
    try {
      const {
        chatType,
        content,
        recipient,
        meeting,
        team,
        replyTo,
        tempId,
      } = payload;

      if (!content?.trim() && !payload.attachment) {
        return ack?.({ success: false, error: "Empty message" });
      }

      const message = await Message.create({
        sender: userId,
        chatType,
        content: content?.trim(),
        recipient: recipient || null,
        meeting: meeting || null,
        team: team || null,
        replyTo: replyTo || null,
        messageType: "text",
      });

      // FIX: name → fullName
      await message.populate("sender", "fullName avatar");
      if (replyTo) await message.populate("replyTo", "content sender");

      let room;
      if (chatType === "direct") {
        room = `direct:${[userId, recipient].sort().join("_")}`;
      } else if (chatType === "meeting") {
        room = `meeting:${meeting}`;
      } else if (chatType === "team") {
        room = `team:${team}`;
      }

      io.to(room).emit("chat:message", { ...message.toObject(), tempId });

      if (chatType === "direct" && recipient) {
        await createNotification({
          recipient,
          sender: userId,
          type: "new_message",
          // FIX: socket.user.name → socket.user.fullName
          title: `New message from ${socket.user.fullName}`,
          body: content?.slice(0, 100) || "Sent a message",
          data: {
            entityType: "message",
            entityId: message._id,
            extra: { senderId: userId },
          },
          io,
        });
      }

      const mentionRegex = /@\[(.+?)\]\((\w+)\)/g;
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        const mentionedUserId = match[2];
        if (mentionedUserId !== userId) {
          await createNotification({
            recipient: mentionedUserId,
            sender: userId,
            type: "message_mention",
            // FIX: socket.user.name → socket.user.fullName
            title: `${socket.user.fullName} mentioned you`,
            body: content.slice(0, 100),
            data: { entityType: "message", entityId: message._id },
            io,
          });
        }
      }

      ack?.({ success: true, data: message });
    } catch (err) {
      console.error("chat:message error:", err);
      ack?.({ success: false, error: "Failed to send message" });
    }
  });

  socket.on("chat:typing_start", ({ chatType, roomId }) => {
    const room = getRoomKey(chatType, roomId, userId);
    socket.to(room).emit("chat:typing", {
      userId,
      // FIX: socket.user.name → socket.user.fullName
      name: socket.user.fullName,
      chatType,
      roomId,
      isTyping: true,
    });
  });

  socket.on("chat:typing_stop", ({ chatType, roomId }) => {
    const room = getRoomKey(chatType, roomId, userId);
    socket.to(room).emit("chat:typing", {
      userId,
      name: socket.user.fullName,
      chatType,
      roomId,
      isTyping: false,
    });
  });

  socket.on("chat:read", async ({ messageId, chatType, roomId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { readBy: { user: userId, readAt: new Date() } },
      });

      const room = getRoomKey(chatType, roomId, userId);
      socket.to(room).emit("chat:read_receipt", {
        messageId,
        userId,
        readAt: new Date(),
      });
    } catch (err) {
      console.error("chat:read error:", err);
    }
  });

  socket.on("chat:edit", async ({ messageId, content, chatType, roomId }, ack) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return ack?.({ success: false, error: "Not found" });
      if (!message.sender.equals(userId))
        return ack?.({ success: false, error: "Forbidden" });

      message.editHistory.push({
        content: message.content,
        editedAt: new Date(),
      });
      message.content = content.trim();
      message.isEdited = true;
      await message.save();

      const room = getRoomKey(chatType, roomId, userId);
      io.to(room).emit("chat:message_edited", {
        messageId,
        content: message.content,
        isEdited: true,
        editedAt: new Date(),
      });

      ack?.({ success: true });
    } catch (err) {
      console.error("chat:edit error:", err);
      ack?.({ success: false, error: "Failed to edit" });
    }
  });

  socket.on("chat:delete", async ({ messageId, chatType, roomId }, ack) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return ack?.({ success: false, error: "Not found" });
      if (!message.sender.equals(userId))
        return ack?.({ success: false, error: "Forbidden" });

      message.isDeleted = true;
      message.deletedAt = new Date();
      message.content = "This message was deleted.";
      await message.save();

      const room = getRoomKey(chatType, roomId, userId);
      io.to(room).emit("chat:message_deleted", { messageId });

      ack?.({ success: true });
    } catch (err) {
      console.error("chat:delete error:", err);
      ack?.({ success: false, error: "Failed to delete" });
    }
  });

  socket.on("chat:react", async ({ messageId, emoji, chatType, roomId }, ack) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return ack?.({ success: false, error: "Not found" });

      const users = message.reactions.get(emoji) || [];
      const alreadyReacted = users.some((id) => id.toString() === userId);

      if (alreadyReacted) {
        message.reactions.set(
          emoji,
          users.filter((id) => id.toString() !== userId)
        );
      } else {
        message.reactions.set(emoji, [...users, userId]);

        if (!message.sender.equals(userId)) {
          await createNotification({
            recipient: message.sender,
            sender: userId,
            type: "message_reaction",
            // FIX: socket.user.name → socket.user.fullName
            title: `${socket.user.fullName} reacted ${emoji}`,
            body: message.content?.slice(0, 80) || "",
            data: { entityType: "message", entityId: message._id },
            io,
          });
        }
      }

      await message.save();

      const room = getRoomKey(chatType, roomId, userId);
      io.to(room).emit("chat:reaction_updated", {
        messageId,
        reactions: Object.fromEntries(message.reactions),
      });

      ack?.({ success: true });
    } catch (err) {
      console.error("chat:react error:", err);
      ack?.({ success: false, error: "Failed to react" });
    }
  });
}

function getRoomKey(chatType, roomId, userId) {
  if (chatType === "direct") {
    return `direct:${[userId, roomId].sort().join("_")}`;
  }
  return `${chatType}:${roomId}`;
}