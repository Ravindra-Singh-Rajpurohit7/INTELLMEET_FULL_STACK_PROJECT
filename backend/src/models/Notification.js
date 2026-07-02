// src/models/Notification.js
// FIX: CommonJS → ES Modules

import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "new_message",
        "message_reaction",
        "message_mention",
        "meeting_invite",
        "meeting_started",
        "meeting_ended",
        "meeting_reminder",
        "task_assigned",
        "task_due_soon",
        "task_completed",
        "task_commented",
        "team_invite",
        "team_role_changed",
        "ai_summary_ready",
        "ai_action_items_ready",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    data: {
      entityType: {
        type: String,
        enum: ["message", "meeting", "task", "team", "user", null],
        default: null,
      },
      entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
      extra: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    isPushed: { type: Boolean, default: false },
    pushedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

notificationSchema.statics.markAllRead = function (recipientId) {
  return this.updateMany(
    { recipient: recipientId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
};

notificationSchema.statics.unreadCount = function (recipientId) {
  return this.countDocuments({ recipient: recipientId, isRead: false });
};

export default mongoose.model("Notification", notificationSchema);