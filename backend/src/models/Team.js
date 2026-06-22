import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: {
        values: ["owner", "admin", "member"],
        message: "Role must be owner, admin, or member",
      },
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    // ─── BASIC INFO ────────────────────────────────────
    name: {
      type: String,
      required: [true, "Team name is required"],
      trim: true,
      minlength: [2, "Team name must be at least 2 characters"],
      maxlength: [50, "Team name cannot exceed 50 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },

    avatar: {
      type: String,
      default: "",
    },

    // ─── OWNERSHIP ─────────────────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Team must have an owner"],
    },

    // ─── MEMBERS ───────────────────────────────────────
    members: {
      type: [teamMemberSchema],
      validate: {
        validator: function (members) {
          return members.length <= 100; // Max 100 members
        },
        message: "Team cannot have more than 100 members",
      },
    },

    // ─── INVITE SYSTEM ─────────────────────────────────
    inviteCode: {
      type: String,
      unique: true,
      sparse: true, // Allow null values with unique
    },

    inviteCodeExpiry: {
      type: Date,
    },

    isInviteEnabled: {
      type: Boolean,
      default: true,
    },

    // ─── PENDING INVITATIONS ───────────────────────────
    pendingInvites: [
      {
        email: {
          type: String,
          lowercase: true,
          trim: true,
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
        token: String,
        invitedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        invitedAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: {
          type: Date,
          default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      },
    ],

    // ─── SETTINGS ─────────────────────────────────────
    settings: {
      allowMemberInvite: { type: Boolean, default: false }, // Only admins can invite?
      isPublic: { type: Boolean, default: false },
    },

    // ─── RELATED PROJECTS ─────────────────────────────
    projects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
      },
    ],

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
teamSchema.index({ owner: 1 });
teamSchema.index({ "members.user": 1 }); // Find teams by member
teamSchema.index({ inviteCode: 1 });
teamSchema.index({ createdAt: -1 });

// ─── VIRTUALS ─────────────────────────────────────────
teamSchema.virtual("memberCount").get(function () {
  return this.members?.length || 0; //  Safe check
});

// ─── METHODS ──────────────────────────────────────────

/**
 * Check if a user is a member of this team
 */
teamSchema.methods.isMember = function (userId) {
  return this.members.some((m) => m.user.equals(userId));
};

/**
 * Get member's role in this team
 */
teamSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find((m) => m.user.equals(userId));
  return member?.role || null;
};

/**
 * Check if user has permission (owner or admin)
 */
teamSchema.methods.hasAdminAccess = function (userId) {
  if (this.owner.equals(userId)) return true;
  const member = this.members.find((m) => m.user.equals(userId));
  return member?.role === "admin";
};

/**
 * Add a member to the team
 */
teamSchema.methods.addMember = function (userId, role = "member", invitedBy) {
  if (!this.isMember(userId)) {
    this.members.push({ user: userId, role, invitedBy });
  }
  return this.save();
};

/**
 * Remove a member from the team
 */
teamSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter((m) => !m.user.equals(userId));
  return this.save();
};

const Team = mongoose.model("Team", teamSchema);
export default Team;