// src/models/Meeting.js

import mongoose from "mongoose";

const actionItemSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },

    assigneeName: {
      type: String,
      default: "Unassigned",
    },

    dueDate: {
      type: Date,
      default: null,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },

    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
  },
  { _id: true }
);

const meetingSchema = new mongoose.Schema(
  {
    // BASIC INFO

    title: {
      type: String,
      required: [true, "Meeting title is required"],
      trim: true,
      minlength: 2,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },

    // OWNER / HOST

    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // RELATIONS

    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },

    // WEBRTC / ROOM INFO

    roomId: {
      type: String,
      unique: true,
      sparse: true,
    },

    meetingCode: {
      type: String,
      unique: true,
      sparse: true,
    },

    // SCHEDULING

    scheduledAt: {
      type: Date,
      default: Date.now,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      default: 0,
    },

    // STATUS

    status: {
      type: String,
      enum: [
        "scheduled",
        "live",
        "ended",
        "cancelled",
      ],
      default: "scheduled",
    },

    // RECORDING

    recordingUrl: {
      type: String,
      default: "",
    },

    // AI DATA

    transcript: {
      type: String,
      default: "",
    },

    summary: {
      type: String,
      default: "",
    },

    smartNotes: {
      type: String,
      default: "",
    },

    actionItems: [actionItemSchema],

    aiStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
      ],
      default: "pending",
    },

    aiMetadata: {
      keyDecisions: [
        {
          type: String,
        },
      ],

      topics: [
        {
          type: String,
        },
      ],

      sentiment: {
        type: String,
        enum: [
          "positive",
          "neutral",
          "negative",
          "mixed",
        ],
      },

      efficiency: {
        type: Number,
        min: 1,
        max: 10,
      },

      keyQuotes: [
        {
          quote: String,
          speaker: String,
        },
      ],

      risks: [
        {
          type: String,
        },
      ],

      followUpDate: {
        type: Date,
        default: null,
      },

      tokensUsed: {
        type: Number,
        default: 0,
      },

      processedAt: {
        type: Date,
        default: null,
      },

      failedAt: {
        type: Date,
        default: null,
      },

      failureReason: {
        type: String,
        default: "",
      },
    },

    // FLAGS

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,

    toJSON: {
      virtuals: true,

      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// INDEXES

meetingSchema.index({ host: 1 });

meetingSchema.index({ team: 1 });

meetingSchema.index({ project: 1 });

meetingSchema.index({ status: 1 });

meetingSchema.index({ aiStatus: 1 });

meetingSchema.index({ scheduledAt: -1 });

meetingSchema.index({ createdAt: -1 });

// VIRTUALS

meetingSchema.virtual("participantCount").get(function () {
  return this.participants.length;
});

// METHODS

meetingSchema.methods.isParticipant = function (userId) {
  return (
    this.host.equals(userId) ||
    this.participants.some((id) => id.equals(userId))
  );
};

meetingSchema.methods.isHost = function (userId) {
  return this.host.equals(userId);
};

const Meeting = mongoose.model("Meeting", meetingSchema);

export default Meeting;