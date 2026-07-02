// src/controllers/project.controller.js
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const assertValidObjectId = (id, label = "ID") => {
  if (!id || !isValidObjectId(id)) {
    throw new ApiError(400, `Invalid ${label} format`);
  }
};

const populateProject = (query) =>
  query
    .populate("owner", "fullName email avatar")
    .populate("members.user", "fullName email avatar")
    .populate("team", "name avatar");

const getProjectAndAssertAccess = async (
  projectId,
  userId,
  { requireManager = false } = {}
) => {
  assertValidObjectId(projectId, "projectId");

  const project = await Project.findOne({ _id: projectId, isActive: true });
  if (!project) throw new ApiError(404, "Project not found");

  if (!project.isMember(userId)) {
    throw new ApiError(403, "You are not a member of this project");
  }

  if (requireManager) {
    const entry = project.members.find((m) => m.user.equals(userId));
    const isOwner = project.owner.equals(userId);
    if (!isOwner && entry?.role !== "manager") {
      throw new ApiError(403, "Only project owner or manager can perform this action");
    }
  }

  return project;
};

const recalculateTaskStats = async (projectId, session = null) => {
  const options = session ? { session } : {};

  const stats = await Task.aggregate(
    [
      { $match: { project: new mongoose.Types.ObjectId(projectId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ],
    options
  );

  const statsMap = stats.reduce((acc, s) => {
    acc[s._id] = s.count;
    return acc;
  }, {});

  const total = Object.values(statsMap).reduce((a, b) => a + b, 0);
  const completed = statsMap["done"] || 0;
  const inProgress = statsMap["in_progress"] || 0;

  return { total, completed, inProgress };
};

// ─── Controllers ──────────────────────────────────────────────────────────────

const createProject = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    teamId,
    color,
    icon,
    startDate,
    dueDate,
    priority,
    tags,
  } = req.body;

  if (!name?.trim()) throw new ApiError(400, "Project name is required");
  if (name.trim().length < 2 || name.trim().length > 100) {
    throw new ApiError(400, "Project name must be between 2 and 100 characters");
  }
  assertValidObjectId(teamId, "teamId");

  if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
    throw new ApiError(400, "startDate cannot be after dueDate");
  }

  const team = await Team.findOne({ _id: teamId, isActive: true });
  if (!team) throw new ApiError(404, "Team not found");

  if (!team.isMember(req.user._id)) {
    throw new ApiError(403, "You are not a member of this team");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [project] = await Project.create(
      [
        {
          name: name.trim(),
          description: description?.trim() || "",
          team: teamId,
          owner: req.user._id,
          color: color || "#6366f1",
          icon: icon || "📁",
          startDate: startDate ? new Date(startDate) : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          priority: priority || "medium",
          tags: tags || [],
          members: [{ user: req.user._id, role: "manager" }],
          taskStats: { total: 0, completed: 0, inProgress: 0 },
        },
      ],
      { session }
    );

    await Team.findByIdAndUpdate(
      teamId,
      { $addToSet: { projects: project._id } },
      { session }
    );

    await session.commitTransaction();

    const populated = await populateProject(Project.findById(project._id));

    return res
      .status(201)
      .json(new ApiResponse(201, populated, "Project created successfully"));
  } catch (err) {
    // STRICT FIX: Sirf tabhi abort karega agar transaction sach me active ho aur commit na hua ho
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
});
const getProjects = asyncHandler(async (req, res) => {
  const { teamId, status, priority } = req.query;

  const filter = {
    "members.user": req.user._id,
    isActive: true,
  };

  if (teamId) {
    assertValidObjectId(teamId, "teamId");
    filter.team = teamId;
  }

  if (status) {
    const validStatuses = ["planning", "active", "on_hold", "completed", "archived"];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }
    filter.status = status;
  }

  if (priority) {
    const validPriorities = ["low", "medium", "high", "critical"];
    if (!validPriorities.includes(priority)) {
      throw new ApiError(400, `Invalid priority. Must be one of: ${validPriorities.join(", ")}`);
    }
    filter.priority = priority;
  }

  const projects = await populateProject(Project.find(filter)).sort({
    createdAt: -1,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, projects, "Projects fetched successfully"));
});

const getSingleProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const project = await getProjectAndAssertAccess(projectId, req.user._id);
  const populated = await populateProject(Project.findById(project._id));

  const taskStats = await recalculateTaskStats(projectId);

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...populated.toJSON(), taskStats },
      "Project fetched successfully"
    )
  );
});

const updateProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const {
    name,
    description,
    color,
    icon,
    status,
    priority,
    startDate,
    dueDate,
    columns,
    tags,
  } = req.body;

  const project = await getProjectAndAssertAccess(projectId, req.user._id, {
    requireManager: true,
  });

  const validStatuses = ["planning", "active", "on_hold", "completed", "archived"];
  const validPriorities = ["low", "medium", "high", "critical"];

  if (status && !validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }
  if (priority && !validPriorities.includes(priority)) {
    throw new ApiError(400, `Invalid priority. Must be one of: ${validPriorities.join(", ")}`);
  }

  const resolvedStart = startDate !== undefined
    ? startDate ? new Date(startDate) : undefined
    : project.startDate;
  const resolvedDue = dueDate !== undefined
    ? dueDate ? new Date(dueDate) : undefined
    : project.dueDate;

  if (resolvedStart && resolvedDue && resolvedStart > resolvedDue) {
    throw new ApiError(400, "startDate cannot be after dueDate");
  }

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new ApiError(400, "Project name cannot be empty");
    if (trimmed.length < 2 || trimmed.length > 100) {
      throw new ApiError(400, "Project name must be between 2 and 100 characters");
    }
    project.name = trimmed;
  }

  if (description !== undefined) project.description = description.trim();
  if (color !== undefined) project.color = color;
  if (icon !== undefined) project.icon = icon;
  if (priority !== undefined) project.priority = priority;
  if (startDate !== undefined)
    project.startDate = startDate ? new Date(startDate) : undefined;
  if (dueDate !== undefined)
    project.dueDate = dueDate ? new Date(dueDate) : undefined;
  if (columns !== undefined) {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new ApiError(400, "columns must be a non-empty array");
    }
    project.columns = columns;
  }
  if (tags !== undefined) project.tags = tags;

  if (status !== undefined && status !== project.status) {
    if (status === "completed" && project.status !== "completed") {
      project.completedAt = new Date();
      const stats = await recalculateTaskStats(projectId);
      project.taskStats = stats;
    } else if (project.status === "completed" && status !== "completed") {
      project.completedAt = undefined;
    }
    project.status = status;
  }

  await project.save();

  const populated = await populateProject(Project.findById(project._id));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Project updated successfully"));
});

const deleteProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  assertValidObjectId(projectId, "projectId");

  const project = await Project.findOne({ _id: projectId, isActive: true });
  if (!project) throw new ApiError(404, "Project not found");

  const isOwner = project.owner.equals(req.user._id);
  const isSuperAdmin = req.user.role === "super_admin";

  if (!isOwner && !isSuperAdmin) {
    throw new ApiError(403, "Only the project owner can delete the project");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    project.isActive = false;
    await project.save({ session });

    await Task.updateMany(
      { project: projectId },
      { isActive: false },
      { session }
    );

    await Team.findByIdAndUpdate(
      project.team,
      { $pull: { projects: project._id } },
      { session }
    );

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Project deleted successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const addProjectMember = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { userId, role = "developer" } = req.body;

  assertValidObjectId(userId, "userId");

  const validRoles = ["manager", "developer", "viewer"];
  if (!validRoles.includes(role)) {
    throw new ApiError(400, `Role must be one of: ${validRoles.join(", ")}`);
  }

  const project = await getProjectAndAssertAccess(projectId, req.user._id, {
    requireManager: true,
  });

  const alreadyMember = project.members.some((m) => m.user.equals(userId));
  if (alreadyMember) {
    throw new ApiError(409, "User is already a member of this project");
  }

  const team = await Team.findOne({ _id: project.team, isActive: true });
  if (!team) throw new ApiError(404, "Associated team not found");

  if (!team.isMember(userId)) {
    throw new ApiError(
      400,
      "User must be a team member before being added to a project"
    );
  }

  await Project.findByIdAndUpdate(projectId, {
    $push: { members: { user: userId, role } },
  });

  const populated = await populateProject(Project.findById(projectId));

  return res
    .status(200)
    .json(
      new ApiResponse(200, populated, "Member added to project successfully")
    );
});

const removeProjectMember = asyncHandler(async (req, res) => {
  const { projectId, memberId } = req.params;

  assertValidObjectId(memberId, "memberId");

  const project = await getProjectAndAssertAccess(projectId, req.user._id, {
    requireManager: true,
  });

  if (project.owner.equals(memberId)) {
    throw new ApiError(400, "Project owner cannot be removed");
  }

  const memberEntry = project.members.find((m) => m.user.equals(memberId));
  if (!memberEntry) {
    throw new ApiError(404, "User is not a member of this project");
  }

  await Project.findByIdAndUpdate(projectId, {
    $pull: { members: { user: memberId } },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Member removed from project successfully"));
});

const updateProjectMemberRole = asyncHandler(async (req, res) => {
  const { projectId, memberId } = req.params;
  const { role } = req.body;

  assertValidObjectId(memberId, "memberId");

  const validRoles = ["manager", "developer", "viewer"];
  if (!validRoles.includes(role)) {
    throw new ApiError(400, `Role must be one of: ${validRoles.join(", ")}`);
  }

  const project = await getProjectAndAssertAccess(projectId, req.user._id, {
    requireManager: true,
  });

  if (project.owner.equals(memberId)) {
    throw new ApiError(400, "Project owner role cannot be changed");
  }

  const memberEntry = project.members.find((m) => m.user.equals(memberId));
  if (!memberEntry) {
    throw new ApiError(404, "User is not a member of this project");
  }

  await Project.findByIdAndUpdate(
    { _id: projectId, "members.user": memberId },
    { $set: { "members.$.role": role } }
  );

  const populated = await populateProject(Project.findById(projectId));

  return res
    .status(200)
    .json(
      new ApiResponse(200, populated, "Member role updated successfully")
    );
});
// project.controller.js mein naya function
const getProjectAnalytics = asyncHandler(async (req, res) => {
  const { teamId } = req.query;

  const filter = teamId ? { team: teamId } : {};

  const [
    totalMeetings,
    totalTasks,
    completedTasks,
    aiProcessedMeetings,
  ] = await Promise.all([
    Meeting.countDocuments({ ...filter, isActive: true }),
    Task.countDocuments(filter),
    Task.countDocuments({ ...filter, status: "done" }),
    Meeting.countDocuments({ ...filter, aiStatus: "completed" }),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      totalMeetings,
      totalTasks,
      completedTasks,
      completionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
      aiProcessedMeetings,
    }, "Analytics fetched")
  );
});
export {
  createProject,
  getProjects,
  getSingleProject,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
  getProjectAnalytics
};