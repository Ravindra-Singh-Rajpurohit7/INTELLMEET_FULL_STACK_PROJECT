// src/controllers/task.controller.js
import mongoose from "mongoose";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendTaskAssignedEmail } from "../services/email.service.js";
import { uploadDocument } from "../services/storage.service.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_STATUSES = ["backlog", "todo", "in_progress", "review", "done"];
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"];

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const assertValidObjectId = (id, label = "ID") => {
  if (!id || !isValidObjectId(id)) {
    throw new ApiError(400, `Invalid ${label} format`);
  }
};

const getTaskAndAssertAccess = async (taskId, userId) => {
  assertValidObjectId(taskId, "taskId");

  const task = await Task.findById(taskId);
  if (!task) throw new ApiError(404, "Task not found");

  const project = await Project.findOne({ _id: task.project, isActive: true });
  if (!project) throw new ApiError(404, "Associated project not found");

  if (!project.isMember(userId)) {
    throw new ApiError(403, "You do not have access to this task");
  }

  return { task, project };
};

const getProjectMemberRole = (project, userId) => {
  if (project.owner.equals(userId)) return "manager";
  const entry = project.members.find((m) => m.user.equals(userId));
  return entry?.role || null;
};

const syncProjectTaskStats = async (projectId, session = null) => {
  const matchStage = { $match: { project: new mongoose.Types.ObjectId(projectId) } };

  const stats = await Task.aggregate([
    matchStage,
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const statsMap = stats.reduce((acc, s) => {
    acc[s._id] = s.count;
    return acc;
  }, {});

  const total = Object.values(statsMap).reduce((a, b) => a + b, 0);
  const completed = statsMap["done"] || 0;
  const inProgress = statsMap["in_progress"] || 0;

  const updateOpts = session ? { session } : {};

  await Project.findByIdAndUpdate(
    projectId,
    { $set: { taskStats: { total, completed, inProgress } } },
    updateOpts
  );
};

const notifyAssignees = async (
  newAssigneeIds,
  task,
  project,
  requesterName
) => {
  if (!newAssigneeIds.length) return;

  const users = await User.find({ _id: { $in: newAssigneeIds } }).select(
    "email fullName"
  );

  await Promise.allSettled(
    users.map((u) =>
      sendTaskAssignedEmail({
        to: u.email,
        assigneeName: u.fullName,
        taskTitle: task.title,
        projectName: project.name,
        dueDate: task.dueDate,
        assignedBy: requesterName,
        taskLink: `${process.env.FRONTEND_URL}/tasks/${task._id}`,
        priority: task.priority,
      })
    )
  );
};

const populateTask = (query) =>
  query
    .populate("createdBy", "fullName email avatar")
    .populate("assignedTo", "fullName email avatar")
    .populate("project", "name color icon columns")
    .populate("team", "name")
    .populate("sourceMeeting", "title scheduledAt")
    .populate("checklist.completedBy", "fullName avatar")
    .populate("attachments.uploadedBy", "fullName avatar")
    .populate("statusHistory.changedBy", "fullName avatar");

// ─── Controllers ──────────────────────────────────────────────────────────────

const createTask = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    projectId,
    teamId,
    assignedTo,
    priority,
    dueDate,
    startDate,
    estimatedHours,
    tags,
    status,
  } = req.body;

  if (!title?.trim()) throw new ApiError(400, "Task title is required");
  if (title.trim().length > 200) {
    throw new ApiError(400, "Task title cannot exceed 200 characters");
  }
  assertValidObjectId(projectId, "projectId");
  assertValidObjectId(teamId, "teamId");

  if (status && !VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    throw new ApiError(400, `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
  }
  if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
    throw new ApiError(400, "startDate cannot be after dueDate");
  }

  const project = await Project.findOne({ _id: projectId, isActive: true });
  if (!project) throw new ApiError(404, "Project not found");

  if (!project.isMember(req.user._id)) {
    throw new ApiError(403, "You are not a member of this project");
  }

  const team = await Team.findOne({ _id: teamId, isActive: true });
  if (!team) throw new ApiError(404, "Team not found");

  const resolvedStatus = status || "todo";
  const resolvedAssignees = Array.isArray(assignedTo)
    ? [...new Set(assignedTo.filter((id) => isValidObjectId(id)))]
    : [];

  if (resolvedAssignees.length > 0) {
    for (const uid of resolvedAssignees) {
      if (!project.isMember(uid)) {
        throw new ApiError(
          400,
          `User ${uid} is not a member of this project and cannot be assigned`
        );
      }
    }
  }

  const highestOrder = await Task.findOne({
    project: projectId,
    status: resolvedStatus,
  })
    .sort({ order: -1 })
    .select("order")
    .lean();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [task] = await Task.create(
      [
        {
          title: title.trim(),
          description: description?.trim() || "",
          project: projectId,
          team: teamId,
          createdBy: req.user._id,
          assignedTo: resolvedAssignees,
          priority: priority || "medium",
          status: resolvedStatus,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          estimatedHours: estimatedHours || undefined,
          tags: tags || [],
          order: (highestOrder?.order ?? 0) + 1,
        },
      ],
      { session }
    );

    await syncProjectTaskStats(projectId, session);

    await session.commitTransaction();

    notifyAssignees(resolvedAssignees, task, project, req.user.fullName).catch(
      () => {}
    );

    const populated = await populateTask(Task.findById(task._id));

    return res
      .status(201)
      .json(new ApiResponse(201, populated, "Task created successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const getTasks = asyncHandler(async (req, res) => {
  const {
    projectId,
    teamId,
    status,
    priority,
    assignedTo,
    aiGenerated,
    page = 1,
    limit = 50,
  } = req.query;

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  const filter = {};

  if (projectId) {
    assertValidObjectId(projectId, "projectId");
    const project = await Project.findOne({ _id: projectId, isActive: true });
    if (!project) throw new ApiError(404, "Project not found");
    if (!project.isMember(req.user._id)) {
      throw new ApiError(403, "You are not a member of this project");
    }
    filter.project = projectId;
  } else if (teamId) {
    assertValidObjectId(teamId, "teamId");
    const team = await Team.findOne({ _id: teamId, isActive: true });
    if (!team) throw new ApiError(404, "Team not found");
    if (!team.isMember(req.user._id)) {
      throw new ApiError(403, "You are not a member of this team");
    }
    filter.team = teamId;
  } else {
    const userTeams = req.user.teams || [];
    if (!userTeams.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { tasks: [], pagination: { page: parsedPage, limit: parsedLimit, total: 0, pages: 0 } },
            "Tasks fetched successfully"
          )
        );
    }
    filter.team = { $in: userTeams };
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }
    filter.status = status;
  }

  if (priority) {
    if (!VALID_PRIORITIES.includes(priority)) {
      throw new ApiError(400, `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
    }
    filter.priority = priority;
  }

  if (assignedTo === "me") {
    filter.assignedTo = req.user._id;
  } else if (assignedTo && isValidObjectId(assignedTo)) {
    filter.assignedTo = assignedTo;
  }

  if (aiGenerated !== undefined) {
    filter.aiGenerated = aiGenerated === "true";
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [tasks, total] = await Promise.all([
    populateTask(Task.find(filter))
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Task.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        tasks,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          pages: Math.ceil(total / parsedLimit),
          hasNext: parsedPage * parsedLimit < total,
          hasPrev: parsedPage > 1,
        },
      },
      "Tasks fetched successfully"
    )
  );
});

const getSingleTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  await getTaskAndAssertAccess(taskId, req.user._id);

  const populated = await populateTask(Task.findById(taskId));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Task fetched successfully"));
});

const updateTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const {
    title,
    description,
    priority,
    dueDate,
    startDate,
    estimatedHours,
    actualHours,
    tags,
    checklist,
  } = req.body;

  const { task, project } = await getTaskAndAssertAccess(taskId, req.user._id);

  const role = getProjectMemberRole(project, req.user._id);
  if (role === "viewer") {
    throw new ApiError(403, "Viewers cannot edit tasks");
  }

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    throw new ApiError(400, `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
  }

  const resolvedStart = startDate !== undefined
    ? startDate ? new Date(startDate) : undefined
    : task.startDate;
  const resolvedDue = dueDate !== undefined
    ? dueDate ? new Date(dueDate) : undefined
    : task.dueDate;

  if (resolvedStart && resolvedDue && resolvedStart > resolvedDue) {
    throw new ApiError(400, "startDate cannot be after dueDate");
  }

  if (title !== undefined) {
    const trimmed = title.trim();
    if (!trimmed) throw new ApiError(400, "Task title cannot be empty");
    if (trimmed.length > 200) {
      throw new ApiError(400, "Task title cannot exceed 200 characters");
    }
    task.title = trimmed;
  }

  if (description !== undefined) task.description = description.trim();
  if (priority !== undefined) task.priority = priority;
  if (dueDate !== undefined)
    task.dueDate = dueDate ? new Date(dueDate) : undefined;
  if (startDate !== undefined)
    task.startDate = startDate ? new Date(startDate) : undefined;
  if (estimatedHours !== undefined) {
    if (estimatedHours < 0) throw new ApiError(400, "estimatedHours cannot be negative");
    task.estimatedHours = estimatedHours;
  }
  if (actualHours !== undefined) {
    if (actualHours < 0) throw new ApiError(400, "actualHours cannot be negative");
    task.actualHours = actualHours;
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags)) throw new ApiError(400, "tags must be an array");
    task.tags = tags;
  }
  if (checklist !== undefined) {
    if (!Array.isArray(checklist)) throw new ApiError(400, "checklist must be an array");
    task.checklist = checklist;
  }

  await task.save();

  const populated = await populateTask(Task.findById(taskId));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Task updated successfully"));
});

const deleteTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const { task, project } = await getTaskAndAssertAccess(taskId, req.user._id);

  const role = getProjectMemberRole(project, req.user._id);
  const isCreator = task.createdBy.equals(req.user._id);

  if (role === "viewer") {
    throw new ApiError(403, "Viewers cannot delete tasks");
  }
  if (role === "developer" && !isCreator) {
    throw new ApiError(403, "Developers can only delete tasks they created");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await Task.findByIdAndDelete(taskId, { session });
    await syncProjectTaskStats(task.project, session);

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Task deleted successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const changeStatus = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { status, order } = req.body;

  if (!status) throw new ApiError(400, "status is required");
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  const { task, project } = await getTaskAndAssertAccess(taskId, req.user._id);

  const role = getProjectMemberRole(project, req.user._id);
  if (role === "viewer") {
    throw new ApiError(403, "Viewers cannot change task status");
  }

  const previousStatus = task.status;

  if (previousStatus === status && order === undefined) {
    const populated = await populateTask(Task.findById(taskId));
    return res
      .status(200)
      .json(new ApiResponse(200, populated, "No changes made"));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    task.status = status;

    if (order !== undefined && typeof order === "number" && order >= 0) {
      task.order = order;
    }

    if (status === "done" && previousStatus !== "done") {
      task.completedAt = new Date();
    } else if (status !== "done" && previousStatus === "done") {
      task.completedAt = undefined;
    }

    if (previousStatus !== status) {
      task.statusHistory.push({
        from: previousStatus,
        to: status,
        changedBy: req.user._id,
        changedAt: new Date(),
      });
    }

    await task.save({ session });
    await syncProjectTaskStats(task.project, session);

    await session.commitTransaction();

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${task.project}`).emit("task:status-changed", {
        taskId,
        previousStatus,
        newStatus: status,
        changedBy: { _id: req.user._id, fullName: req.user.fullName },
      });
    }

    const populated = await populateTask(Task.findById(taskId));

    return res
      .status(200)
      .json(new ApiResponse(200, populated, "Task status updated successfully"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const assignMembers = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { userIds } = req.body;

  if (!Array.isArray(userIds)) {
    throw new ApiError(400, "userIds must be an array");
  }

  const deduped = [...new Set(userIds)];
  for (const uid of deduped) {
    assertValidObjectId(uid, "userId in userIds");
  }

  const { task, project } = await getTaskAndAssertAccess(taskId, req.user._id);

  const role = getProjectMemberRole(project, req.user._id);
  if (role === "viewer") {
    throw new ApiError(403, "Viewers cannot assign task members");
  }

  for (const uid of deduped) {
    if (!project.isMember(uid)) {
      throw new ApiError(
        400,
        `User ${uid} is not a member of this project and cannot be assigned`
      );
    }
  }

  const previousAssigneeIds = task.assignedTo.map((id) => id.toString());
  const newAssigneeIds = deduped.filter(
    (uid) => !previousAssigneeIds.includes(uid.toString())
  );

  task.assignedTo = deduped;
  await task.save();

  notifyAssignees(newAssigneeIds, task, project, req.user.fullName).catch(
    () => {}
  );

  const populated = await populateTask(Task.findById(taskId));

  return res
    .status(200)
    .json(
      new ApiResponse(200, populated, "Task members updated successfully")
    );
});

const uploadAttachment = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  if (!req.file) throw new ApiError(400, "No file provided");

  const { task, project } = await getTaskAndAssertAccess(taskId, req.user._id);

  const role = getProjectMemberRole(project, req.user._id);
  if (role === "viewer") {
    throw new ApiError(403, "Viewers cannot upload attachments");
  }

  let uploaded;
  try {
    uploaded = await uploadDocument(req.file.path, "tasks");
  } catch (err) {
    throw new ApiError(500, `File upload failed: ${err.message}`);
  }

  const isImage = req.file.mimetype.startsWith("image/");

  task.attachments.push({
    name: req.file.originalname,
    url: uploaded.url,
    publicId: uploaded.publicId,
    type: isImage ? "image" : "document",
    size: req.file.size,
    uploadedBy: req.user._id,
    uploadedAt: new Date(),
  });

  await task.save();

  const populated = await Task.findById(taskId)
    .select("attachments")
    .populate("attachments.uploadedBy", "fullName avatar");

  return res
    .status(200)
    .json(
      new ApiResponse(200, populated.attachments, "Attachment uploaded successfully")
    );
});

const removeAttachment = asyncHandler(async (req, res) => {
  const { taskId, attachmentId } = req.params;

  assertValidObjectId(attachmentId, "attachmentId");

  const { task, project } = await getTaskAndAssertAccess(taskId, req.user._id);

  const role = getProjectMemberRole(project, req.user._id);

  const attachment = task.attachments.id(attachmentId);
  if (!attachment) throw new ApiError(404, "Attachment not found");

  const isUploader = attachment.uploadedBy?.equals(req.user._id);
  if (role === "viewer") {
    throw new ApiError(403, "Viewers cannot remove attachments");
  }
  if (role === "developer" && !isUploader) {
    throw new ApiError(403, "You can only remove your own attachments");
  }

  const { deleteFile } = await import("../services/storage.service.js");
  if (attachment.publicId) {
    await deleteFile(
      attachment.publicId,
      attachment.type === "image" ? "image" : "raw"
    ).catch(() => {});
  }

  task.attachments.pull(attachmentId);
  await task.save();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Attachment removed successfully"));
});

const updateChecklistItem = asyncHandler(async (req, res) => {
  const { taskId, itemId } = req.params;
  const { completed } = req.body;

  assertValidObjectId(itemId, "itemId");

  if (typeof completed !== "boolean") {
    throw new ApiError(400, "completed must be a boolean");
  }

  const { task } = await getTaskAndAssertAccess(taskId, req.user._id);

  const item = task.checklist.id(itemId);
  if (!item) throw new ApiError(404, "Checklist item not found");

  item.completed = completed;
  item.completedBy = completed ? req.user._id : undefined;
  item.completedAt = completed ? new Date() : undefined;

  await task.save();

  const populated = await populateTask(Task.findById(taskId));

  return res
    .status(200)
    .json(
      new ApiResponse(200, populated, "Checklist item updated successfully")
    );
});

export {
  createTask,
  getTasks,
  getSingleTask,
  updateTask,
  deleteTask,
  changeStatus,
  assignMembers,
  uploadAttachment,
  removeAttachment,
  updateChecklistItem,
};