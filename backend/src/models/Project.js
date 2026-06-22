import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    // ─── BASIC INFO ────────────────────────────────────
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      minlength: [2, "Project name must be at least 2 characters"],
      maxlength: [100, "Project name cannot exceed 100 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: "",
    },

    // ─── VISUAL ───────────────────────────────────────
    color: {
      type: String,
      default: "#6366f1", // Indigo
      match: [/^#[0-9A-F]{6}$/i, "Invalid color format"],
    },

    icon: {
      type: String,
      default: "📁",
    },

    // ─── OWNERSHIP & RELATIONS ─────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Project must belong to a team"],
    },

    // ─── MEMBERS WITH ROLES ────────────────────────────
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["manager", "developer", "viewer"],
          default: "developer",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],

    // ─── STATUS & PRIORITY ─────────────────────────────
    status: {
      type: String,
      enum: {
        values: ["planning", "active", "on_hold", "completed", "archived"],
        message: "Invalid project status",
      },
      default: "planning",
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    // ─── TIMELINE ─────────────────────────────────────
    startDate: {
      type: Date,
    },

    dueDate: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    // ─── KANBAN COLUMNS ───────────────────────────────
    // Custom columns for this project's Kanban board
    columns: {
      type: [String],
      default: ["backlog", "todo", "in_progress", "review", "done"],
    },

    // ─── TAGS ─────────────────────────────────────────
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30,
      },
    ],

    // ─── TASK COUNT (Denormalized for performance) ─────
    taskStats: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      inProgress: { type: Number, default: 0 },
    },

    // ─── STATUS ───────────────────────────────────────
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

// ─── INDEXES ──────────────────────────────────────────
projectSchema.index({ team: 1, status: 1 });
projectSchema.index({ owner: 1 });
projectSchema.index({ "members.user": 1 });
projectSchema.index({ createdAt: -1 });

// ─── VIRTUALS ─────────────────────────────────────────
projectSchema.virtual("completionPercentage").get(function () {
  if (!this.taskStats.total) return 0;
  return Math.round((this.taskStats.completed / this.taskStats.total) * 100);
});

projectSchema.virtual("isOverdue").get(function () {
  if (!this.dueDate) return false;
  return this.dueDate < new Date() && this.status !== "completed";
});

// ─── METHODS ──────────────────────────────────────────
projectSchema.methods.isMember = function (userId) {
  return (
    this.owner.equals(userId) ||
    this.members.some((m) => m.user.equals(userId))
  );
};

const Project = mongoose.model("Project", projectSchema);
export default Project;