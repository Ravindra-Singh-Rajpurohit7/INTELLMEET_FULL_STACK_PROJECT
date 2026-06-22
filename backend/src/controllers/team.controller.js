// src/controllers/team.controller.js
import mongoose from "mongoose";
import Team from "../models/Team.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendTeamInviteEmail } from "../services/email.service.js";
import crypto from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const assertValidObjectId = (id, label = "ID") => {
  if (!id || !isValidObjectId(id)) {
    throw new ApiError(400, `Invalid ${label} format`);
  }
};

const getTeamAndAssertMembership = async (teamId, userId, requireAdmin = false) => {
  assertValidObjectId(teamId, "teamId");

  const team = await Team.findOne({ _id: teamId, isActive: true });
  if (!team) throw new ApiError(404, "Team not found");

  const isMember = team.isMember(userId);
  if (!isMember) throw new ApiError(403, "You are not a member of this team");

  if (requireAdmin && !team.hasAdminAccess(userId)) {
    throw new ApiError(403, "Only team owner or admin can perform this action");
  }

  return team;
};

const populateTeam = (query) =>
  query
    .populate("owner", "fullName email avatar")
    .populate("members.user", "fullName email avatar")
    .populate("members.invitedBy", "fullName email")
    .populate("projects", "name description status color");

// ─── Controllers ──────────────────────────────────────────────────────────────

const createTeam = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name?.trim()) throw new ApiError(400, "Team name is required");
  if (name.trim().length < 2 || name.trim().length > 50) {
    throw new ApiError(400, "Team name must be between 2 and 50 characters");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await Team.findOne({
      name: name.trim(),
      "members.user": req.user._id,
      isActive: true,
    }).session(session);

    if (existing) {
      throw new ApiError(409, "You already own or belong to a team with this name");
    }

    const [team] = await Team.create(
      [
        {
          name: name.trim(),
          description: description?.trim() || "",
          owner: req.user._id,
          members: [{ user: req.user._id, role: "owner" }],
        },
      ],
      { session }
    );

    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { teams: team._id } },
      { session }
    );

    await session.commitTransaction();

    const populated = await populateTeam(Team.findById(team._id));

    return res
      .status(201)
      .json(new ApiResponse(201, populated, "Team created successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const getTeams = asyncHandler(async (req, res) => {
  const teams = await populateTeam(
    Team.find({ "members.user": req.user._id, isActive: true })
  ).sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, teams, "Teams fetched successfully"));
});

const getSingleTeam = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const team = await getTeamAndAssertMembership(teamId, req.user._id);
  const populated = await populateTeam(Team.findById(team._id));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Team fetched successfully"));
});

const updateTeam = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { name, description, settings } = req.body;

  const team = await getTeamAndAssertMembership(teamId, req.user._id, true);

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new ApiError(400, "Team name cannot be empty");
    if (trimmed.length < 2 || trimmed.length > 50) {
      throw new ApiError(400, "Team name must be between 2 and 50 characters");
    }
    team.name = trimmed;
  }

  if (description !== undefined) team.description = description.trim();

  if (settings && typeof settings === "object") {
    team.settings = { ...team.settings.toObject?.() ?? team.settings, ...settings };
  }

  await team.save();

  const populated = await populateTeam(Team.findById(team._id));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Team updated successfully"));
});

const deleteTeam = asyncHandler(async (req, res) => {
  const { teamId } = req.params;

  assertValidObjectId(teamId, "teamId");

  const team = await Team.findOne({ _id: teamId, isActive: true });
  if (!team) throw new ApiError(404, "Team not found");

  if (!team.owner.equals(req.user._id)) {
    throw new ApiError(403, "Only the team owner can delete the team");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    team.isActive = false;
    await team.save({ session });

    await User.updateMany(
      { teams: teamId },
      { $pull: { teams: team._id } },
      { session }
    );

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Team deleted successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const inviteMember = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { email, role = "member" } = req.body;

  if (!email?.trim()) throw new ApiError(400, "Email is required");
  if (!["admin", "member"].includes(role)) {
    throw new ApiError(400, "Role must be 'admin' or 'member'");
  }

  const team = await getTeamAndAssertMembership(teamId, req.user._id, true);

  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedEmail === req.user.email) {
    throw new ApiError(400, "You cannot invite yourself");
  }

  const invitee = await User.findOne({ email: normalizedEmail }).select(
    "_id email fullName"
  );

  if (invitee) {
    const alreadyMember = team.members.some((m) =>
      m.user.equals(invitee._id)
    );
    if (alreadyMember) {
      throw new ApiError(409, "This user is already a member of the team");
    }
  }

  const now = new Date();
  const activePending = team.pendingInvites.find(
    (inv) => inv.email === normalizedEmail && inv.expiresAt > now
  );
  if (activePending) {
    throw new ApiError(409, "An active invitation already exists for this email");
  }

  // Remove expired invites for same email before adding new
  team.pendingInvites = team.pendingInvites.filter(
    (inv) => !(inv.email === normalizedEmail && inv.expiresAt <= now)
  );

  const token = crypto.randomBytes(32).toString("hex");
  const inviteLink = `${process.env.FRONTEND_URL}/teams/join?token=${token}&teamId=${teamId}`;

  team.pendingInvites.push({
    email: normalizedEmail,
    role,
    token,
    invitedBy: req.user._id,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  });

  await team.save();

  await sendTeamInviteEmail({
    to: normalizedEmail,
    inviterName: req.user.fullName,
    teamName: team.name,
    inviteLink,
    role,
  }).catch((err) =>
    console.error("[inviteMember] Email send failed:", err.message)
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, { inviteLink }, "Invitation sent successfully")
    );
});

const joinTeam = asyncHandler(async (req, res) => {
  const { token, teamId } = req.body;

  if (!token || !teamId) {
    throw new ApiError(400, "token and teamId are required");
  }
  assertValidObjectId(teamId, "teamId");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // findOneAndUpdate with atomic check to prevent race conditions
    const team = await Team.findOneAndUpdate(
      {
        _id: teamId,
        isActive: true,
        pendingInvites: {
          $elemMatch: {
            token,
            email: req.user.email,
            expiresAt: { $gt: new Date() },
          },
        },
      },
      {
        $pull: { pendingInvites: { token } },
      },
      { new: false, session }
    );

    if (!team) {
      throw new ApiError(400, "Invalid or expired invitation token");
    }

    const alreadyMember = team.members.some((m) =>
      m.user.equals(req.user._id)
    );
    if (alreadyMember) {
      await session.abortTransaction();
      const populated = await populateTeam(Team.findById(teamId));
      return res
        .status(200)
        .json(
          new ApiResponse(200, populated, "You are already a member of this team")
        );
    }

    const invite = team.pendingInvites.find(
      (inv) => inv.token === token && inv.email === req.user.email
    );

    await Team.findByIdAndUpdate(
      teamId,
      {
        $push: {
          members: {
            user: req.user._id,
            role: invite?.role || "member",
            invitedBy: invite?.invitedBy,
          },
        },
      },
      { session }
    );

    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { teams: team._id } },
      { session }
    );

    await session.commitTransaction();

    const populated = await populateTeam(Team.findById(teamId));

    return res
      .status(200)
      .json(new ApiResponse(200, populated, "Joined team successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const removeMember = asyncHandler(async (req, res) => {
  const { teamId, memberId } = req.params;

  assertValidObjectId(teamId, "teamId");
  assertValidObjectId(memberId, "memberId");

  const isSelfRemoval = req.user._id.equals(memberId);

  const team = await Team.findOne({ _id: teamId, isActive: true });
  if (!team) throw new ApiError(404, "Team not found");

  if (!isSelfRemoval && !team.hasAdminAccess(req.user._id)) {
    throw new ApiError(403, "Only owner or admin can remove other members");
  }

  if (team.owner.equals(memberId)) {
    throw new ApiError(400, "Team owner cannot be removed from the team");
  }

  const memberEntry = team.members.find((m) => m.user.equals(memberId));
  if (!memberEntry) throw new ApiError(404, "User is not a member of this team");

  const requesterRole = team.getMemberRole(req.user._id);
  if (
    !isSelfRemoval &&
    memberEntry.role === "admin" &&
    requesterRole !== "owner"
  ) {
    throw new ApiError(403, "Only the team owner can remove an admin");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await Team.findByIdAndUpdate(
      teamId,
      { $pull: { members: { user: memberId } } },
      { session }
    );

    await User.findByIdAndUpdate(
      memberId,
      { $pull: { teams: team._id } },
      { session }
    );

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Member removed successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const updateMemberRole = asyncHandler(async (req, res) => {
  const { teamId, memberId } = req.params;
  const { role } = req.body;

  assertValidObjectId(teamId, "teamId");
  assertValidObjectId(memberId, "memberId");

  if (!["admin", "member"].includes(role)) {
    throw new ApiError(400, "Role must be 'admin' or 'member'");
  }

  const team = await Team.findOne({ _id: teamId, isActive: true });
  if (!team) throw new ApiError(404, "Team not found");

  if (!team.owner.equals(req.user._id)) {
    throw new ApiError(403, "Only the team owner can change member roles");
  }

  if (team.owner.equals(memberId)) {
    throw new ApiError(400, "Owner role cannot be changed");
  }

  const memberEntry = team.members.find((m) => m.user.equals(memberId));
  if (!memberEntry) throw new ApiError(404, "User is not a member of this team");

  memberEntry.role = role;
  await team.save();

  const populated = await populateTeam(Team.findById(teamId));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Member role updated successfully"));
});

export {
  createTeam,
  getTeams,
  getSingleTeam,
  updateTeam,
  deleteTeam,
  inviteMember,
  joinTeam,
  removeMember,
  updateMemberRole,
};