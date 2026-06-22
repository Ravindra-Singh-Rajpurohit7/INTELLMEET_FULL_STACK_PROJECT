import mongoose from "mongoose";

const checklistItemSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    completedAt: Date,
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    // ─── CORE FIELDS ──────────────────────────────────
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      minlength: [2, "Title must be at least 2 characters"],
      maxlength: [200, "Title cannot exceed 200 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [5000, "Description cannot exceed 5000 characters"],
      default: "",
    },

    // ─── STATUS (Kanban Column) ────────────────────────
    status: {
      type: String,
      enum: {
        values: ["backlog", "todo", "in_progress", "review", "done"],
        message: "Invalid status value",
      },
      default: "todo",
    },

    // ─── PRIORITY ─────────────────────────────────────
    priority: {
      type: String,
      enum: {
        values: ["low", "medium", "high", "urgent"],
        message: "Invalid priority value",
      },
      default: "medium",
    },

    // ─── RELATIONS ────────────────────────────────────
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Task must belong to a project"],
    },

    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Task must belong to a team"],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ─── ASSIGNMENT ───────────────────────────────────
    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // ─── DATES ────────────────────────────────────────
    dueDate: {
      type: Date,
    },

    startDate: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    estimatedHours: {
      type: Number,
      min: 0,
      max: 1000,
    },

    actualHours: {
      type: Number,
      min: 0,
      max: 1000,
    },

    // ─── KANBAN ORDERING ──────────────────────────────
    // Used for drag-and-drop ordering within a column
    order: {
      type: Number,
      default: 0,
    },

    // ─── CHECKLIST ────────────────────────────────────
    checklist: [checklistItemSchema],

    // ─── TAGS ─────────────────────────────────────────
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30,
      },
    ],

    // ─── AI SOURCE ────────────────────────────────────
    // Was this task auto-generated from a meeting?
    aiGenerated: {
      type: Boolean,
      default: false,
    },

    sourceMeeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      default: null,
    },

    // ─── ATTACHMENTS ──────────────────────────────────
    attachments: [
      {
        name: String,
        url: String,
        publicId: String,
        type: String, // 'image', 'document', 'other'
        size: Number,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        _id: true,
      },
    ],

    // ─── COMMENTS COUNT (Denormalized) ────────────────
    commentCount: {
      type: Number,
      default: 0,
    },

    // ─── STATUS HISTORY ───────────────────────────────
    statusHistory: [
      {
        from: String,
        to: String,
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],
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

// ═══════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════
taskSchema.index({ project: 1, status: 1, order: 1 }); // Kanban board query
taskSchema.index({ assignedTo: 1, status: 1 }); // My tasks
taskSchema.index({ team: 1, createdAt: -1 }); // Team tasks
taskSchema.index({ sourceMeeting: 1 }); // AI generated tasks
taskSchema.index({ dueDate: 1, status: 1 }); // Overdue tasks
taskSchema.index({ createdBy: 1 });

// ═══════════════════════════════════════════════════════
// VIRTUALS
// ═══════════════════════════════════════════════════════
taskSchema.virtual("isOverdue").get(function () {
  if (!this.dueDate) return false;
  return this.dueDate < new Date() && this.status !== "done";
});

taskSchema.virtual("checklistProgress").get(function () {
  if (!this.checklist.length) return null;
  const completed = this.checklist.filter((item) => item.completed).length;
  return {
    completed,
    total: this.checklist.length,
    percentage: Math.round((completed / this.checklist.length) * 100),
  };
});

// ═══════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════

// Track status changes automatically
taskSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    // Set completedAt when task is done
    if (this.status === "done" && !this.completedAt) {
      this.completedAt = new Date();
    }
    // Clear completedAt if task re-opened
    if (this.status !== "done") {
      this.completedAt = undefined;
    }

    // Add to status history
    const previousStatus = this._previousStatus;
    if (previousStatus) {
      this.statusHistory.push({
        from: previousStatus,
        to: this.status,
        changedAt: new Date(),
      });
    }
  }
  next();
});

// Store previous status before update
taskSchema.pre("save", function (next) {
  if (!this.isNew && this.isModified("status")) {
    this._previousStatus = this.$__delta()?.[1]?.status;
  }
  next();
});

const Task = mongoose.model("Task", taskSchema);
export default Task;