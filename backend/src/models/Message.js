// src/models/Message.js
// FIX: CommonJS → ES Modules

import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chatType: {
      type: String,
      enum: ["direct", "meeting", "team"],
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    meeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      default: null,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    attachments: [
      {
        url: String,
        publicId: String,
        fileType: {
          type: String,
          enum: ["image", "video", "audio", "document", "other"],
        },
        fileName: String,
        fileSize: Number,
      },
    ],
    messageType: {
      type: String,
      enum: ["text", "file", "system", "ai_summary"],
      default: "text",
    },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        readAt: { type: Date, default: Date.now },
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    reactions: {
      type: Map,
      of: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: {},
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    isEdited: { type: Boolean, default: false },
    editHistory: [
      {
        content: String,
        editedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, createdAt: -1 });
messageSchema.index({ meeting: 1, createdAt: 1 });
messageSchema.index({ team: 1, createdAt: -1 });
messageSchema.index({ chatType: 1 });

messageSchema.statics.getDirectConversation = function (
  userId1,
  userId2,
  page = 1,
  limit = 50
) {
  return this.find({
    chatType: "direct",
    isDeleted: false,
    $or: [
      { sender: userId1, recipient: userId2 },
      { sender: userId2, recipient: userId1 },
    ],
  })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    // FIX: name → fullName
    .populate("sender", "fullName avatar")
    .populate("recipient", "fullName avatar")
    .populate("replyTo", "content sender");
};

export default mongoose.model("Message", messageSchema);