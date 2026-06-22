// src/controllers/ai.controller.js
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Meeting from "../models/Meeting.js";
import Task from "../models/Task.js";
import * as aiService from "../services/ai.service.js";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const transcribeAudio = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "Audio file is required");

  const { meetingId } = req.body;

  if (meetingId && !isValidObjectId(meetingId)) {
    throw new ApiError(400, "Invalid meetingId format");
  }

  const result = await aiService.transcribeAudio(req.file.path);

  if (meetingId) {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) throw new ApiError(404, "Meeting not found");

    if (!meeting.host.equals(req.user._id) && req.user.role !== "super_admin") {
      throw new ApiError(403, "Only the meeting host can update this meeting");
    }

    await Meeting.findByIdAndUpdate(meetingId, {
      transcript: result.text,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Audio transcribed successfully"));
});

const analyzeMeetingTranscript = asyncHandler(async (req, res) => {
  const { transcript, meetingTitle, meetingId } = req.body;

  if (!transcript?.trim()) throw new ApiError(400, "Transcript text is required");
  if (!meetingTitle?.trim()) throw new ApiError(400, "Meeting title is required");

  if (meetingId && !isValidObjectId(meetingId)) {
    throw new ApiError(400, "Invalid meetingId format");
  }

  const analysis = await aiService.analyzeMeetingTranscript(
    transcript,
    meetingTitle
  );

  if (meetingId) {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) throw new ApiError(404, "Meeting not found");

    if (!meeting.host.equals(req.user._id) && req.user.role !== "super_admin") {
      throw new ApiError(403, "Only the meeting host can update this meeting");
    }

    await Meeting.findByIdAndUpdate(meetingId, {
      summary: analysis.summary,
      actionItems: analysis.actionItems?.map((item) => ({
        text: item.task,
        assigneeName: item.assignee,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        priority: item.priority || "medium",
        status: "pending",
      })),
      aiMetadata: {
        keyDecisions: analysis.keyDecisions,
        topics: analysis.topics,
        sentiment: analysis.sentiment,
        efficiency: analysis.meetingEfficiency,
        processedAt: new Date(),
      },
      aiStatus: "completed",
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, analysis, "Transcript analyzed successfully"));
});

const generateSmartNotes = asyncHandler(async (req, res) => {
  const { transcript, meetingId } = req.body;

  if (!transcript?.trim()) throw new ApiError(400, "Transcript text is required");

  if (meetingId && !isValidObjectId(meetingId)) {
    throw new ApiError(400, "Invalid meetingId format");
  }

  const notes = await aiService.generateSmartNotes(transcript);

  if (meetingId) {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) throw new ApiError(404, "Meeting not found");

    if (!meeting.host.equals(req.user._id) && req.user.role !== "super_admin") {
      throw new ApiError(403, "Only the meeting host can update this meeting");
    }

    await Meeting.findByIdAndUpdate(meetingId, { smartNotes: notes });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { notes }, "Smart notes generated successfully"));
});

const processMeetingAI = asyncHandler(async (req, res) => {
  const { meetingId } = req.body;

  if (!meetingId) throw new ApiError(400, "meetingId is required");
  if (!isValidObjectId(meetingId)) throw new ApiError(400, "Invalid meetingId format");

  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw new ApiError(404, "Meeting not found");

  if (!meeting.host.equals(req.user._id) && req.user.role !== "super_admin") {
    throw new ApiError(403, "Only the meeting host can trigger AI processing");
  }

  if (meeting.aiStatus === "processing") {
    throw new ApiError(409, "AI processing is already in progress for this meeting");
  }

  const audioFilePath = req.file?.path || null;

  await Meeting.findByIdAndUpdate(meetingId, { aiStatus: "processing" });

  const io = req.app.get("io");

  aiService
    .processMeetingAI(meetingId, audioFilePath)
    .then((result) => {
      if (io) {
        io.to(`meeting:${meetingId}`).emit("ai:processing-complete", {
          meetingId,
          tasksCreated: result.tasksCreated,
          actionItems: result.actionItems,
          summary: result.summary,
        });
      }
    })
    .catch((err) => {
      console.error(`[AI] Processing failed for meeting ${meetingId}:`, err.message);
      if (io) {
        io.to(`meeting:${meetingId}`).emit("ai:processing-failed", {
          meetingId,
          error: err.message,
        });
      }
    });

  return res.status(202).json(
    new ApiResponse(
      202,
      { meetingId, status: "processing" },
      "AI processing started. You will be notified when complete."
    )
  );
});

const breakdownTask = asyncHandler(async (req, res) => {
  const { taskTitle, taskDescription, taskId } = req.body;

  if (!taskTitle?.trim()) throw new ApiError(400, "Task title is required");

  if (taskId && !isValidObjectId(taskId)) {
    throw new ApiError(400, "Invalid taskId format");
  }

  const breakdown = await aiService.breakdownTask(
    taskTitle.trim(),
    taskDescription?.trim() || ""
  );

  if (taskId && breakdown.subtasks?.length > 0) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, "Task not found");

    const checklistItems = breakdown.subtasks.map((sub) => ({
      text: sub.title,
      completed: false,
    }));

    task.checklist.push(...checklistItems);
    await task.save();
  }

  return res
    .status(200)
    .json(new ApiResponse(200, breakdown, "Task breakdown generated successfully"));
});

const getMeetingAIStatus = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  if (!isValidObjectId(meetingId)) {
    throw new ApiError(400, "Invalid meetingId format");
  }

  const meeting = await Meeting.findById(meetingId).select(
    "title aiStatus aiMetadata host"
  );
  if (!meeting) throw new ApiError(404, "Meeting not found");

  if (!meeting.host.equals(req.user._id) && req.user.role !== "super_admin") {
    throw new ApiError(403, "You do not have access to this meeting");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        meetingId,
        title: meeting.title,
        status: meeting.aiStatus,
        processedAt: meeting.aiMetadata?.processedAt || null,
        failureReason: meeting.aiMetadata?.failureReason || null,
      },
      "AI status fetched successfully"
    )
  );
});

const getMeetingSummary = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  if (!isValidObjectId(meetingId)) {
    throw new ApiError(400, "Invalid meetingId format");
  }

  const meeting = await Meeting.findById(meetingId)
    .select(
      "title summary smartNotes actionItems aiStatus aiMetadata host"
    )
    .populate("actionItems.taskId", "status title assignedTo")
    .populate("host", "fullName avatar");

  if (!meeting) throw new ApiError(404, "Meeting not found");

  if (!meeting.host._id.equals(req.user._id) && req.user.role !== "super_admin") {
    throw new ApiError(403, "You do not have access to this meeting summary");
  }

  if (meeting.aiStatus === "pending") {
    throw new ApiError(
      400,
      "AI analysis has not been started for this meeting. Trigger processing first."
    );
  }

  if (meeting.aiStatus === "processing") {
    return res.status(202).json(
      new ApiResponse(
        202,
        { status: "processing" },
        "AI is still processing. Please check back in a few minutes."
      )
    );
  }

  if (meeting.aiStatus === "failed") {
    throw new ApiError(
      500,
      `AI processing failed: ${meeting.aiMetadata?.failureReason || "Unknown error"}`
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        meetingId,
        title: meeting.title,
        summary: meeting.summary,
        smartNotes: meeting.smartNotes,
        actionItems: meeting.actionItems,
        metadata: meeting.aiMetadata,
      },
      "Meeting summary fetched successfully"
    )
  );
});

export {
  transcribeAudio,
  analyzeMeetingTranscript,
  generateSmartNotes,
  processMeetingAI,
  breakdownTask,
  getMeetingAIStatus,
  getMeetingSummary,
};