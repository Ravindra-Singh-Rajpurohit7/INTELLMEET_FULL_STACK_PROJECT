// src/controllers/meeting.controller.js
import mongoose from "mongoose";
import Meeting from "../models/Meeting.js";
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

const generateMeetingCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 9 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  )
    .join("")
    .replace(/(.{3})(.{3})(.{3})/, "$1-$2-$3");
};

const generateRoomId = () => {
  return `room-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const populateMeeting = (query) =>
  query
    .populate("host", "fullName email avatar")
    .populate("participants", "fullName email avatar")
    .populate("team", "name avatar")
    .populate("project", "name color icon");

const assertMeetingAccess = (meeting, userId) => {
  if (!meeting.isParticipant(userId)) {
    throw new ApiError(403, "You do not have access to this meeting");
  }
};

const assertMeetingHost = (meeting, userId) => {
  if (!meeting.isHost(userId)) {
    throw new ApiError(403, "Only the meeting host can perform this action");
  }
};

const getMeetingById = async (meetingId) => {
  assertValidObjectId(meetingId, "meetingId");
  const meeting = await Meeting.findOne({ _id: meetingId, isActive: true });
  if (!meeting) throw new ApiError(404, "Meeting not found");
  return meeting;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

const createMeeting = asyncHandler(async (req, res) => {
  const { title, description, participants, team, project, scheduledAt } =
    req.body;

  if (!title?.trim()) throw new ApiError(400, "Meeting title is required");
  if (title.trim().length < 2 || title.trim().length > 200) {
    throw new ApiError(
      400,
      "Meeting title must be between 2 and 200 characters"
    );
  }

  if (team) assertValidObjectId(team, "team");
  if (project) assertValidObjectId(project, "project");

  const resolvedParticipants = Array.isArray(participants)
    ? [
        ...new Set(
          participants
            .filter((id) => isValidObjectId(id))
            .map((id) => id.toString())
            .filter((id) => id !== req.user._id.toString())
        ),
      ]
    : [];

  const meeting = await Meeting.create({
    title: title.trim(),
    description: description?.trim() || "",
    host: req.user._id,
    participants: resolvedParticipants,
    team: team || null,
    project: project || null,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
    roomId: generateRoomId(),
    meetingCode: generateMeetingCode(),
  });

  const populated = await populateMeeting(Meeting.findById(meeting._id));

  return res
    .status(201)
    .json(new ApiResponse(201, populated, "Meeting created successfully"));
});

const getAllMeetings = asyncHandler(async (req, res) => {
  const { status, team, project, page = 1, limit = 20 } = req.query;

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const filter = {
    isActive: true,
    $or: [{ host: req.user._id }, { participants: req.user._id }],
  };

  if (status) {
    const validStatuses = ["scheduled", "live", "ended", "cancelled"];
    if (!validStatuses.includes(status)) {
      throw new ApiError(
        400,
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }
    filter.status = status;
  }

  if (team) {
    assertValidObjectId(team, "team");
    filter.team = team;
  }

  if (project) {
    assertValidObjectId(project, "project");
    filter.project = project;
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [meetings, total] = await Promise.all([
    populateMeeting(Meeting.find(filter))
      .sort({ scheduledAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Meeting.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        meetings,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          pages: Math.ceil(total / parsedLimit),
          hasNext: parsedPage * parsedLimit < total,
          hasPrev: parsedPage > 1,
        },
      },
      "Meetings fetched successfully"
    )
  );
});


// POST /api/v1/meetings/:meetingId/invite
const inviteToMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const { emails } = req.body;

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    throw new ApiError(400, "emails array is required");
  }

  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw new ApiError(404, "Meeting not found");

  if (!meeting.host.equals(req.user._id)) {
    throw new ApiError(403, "Only host can send invites");
  }

  // FIX: Direct room link — code se join bhi ho sakta hai
  const joinByCodeLink = `${process.env.FRONTEND_URL}/dashboard`;
  const directJoinLink = `${process.env.FRONTEND_URL}/room/${meetingId}`;
  const meetingCode = meeting.meetingCode;

  const { sendEmail } = await import("../services/email.service.js");

  await Promise.allSettled(
    emails.map((email) =>
      sendEmail({
        to: email,
        subject: `You're invited to "${meeting.title}" on IntellMeet`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0f172a; color: #e2e8f0; border-radius: 16px;">
            <h2 style="color: #818cf8; margin-bottom: 8px;">Meeting Invitation 📹</h2>
            <p style="color: #94a3b8; margin-bottom: 24px;">
              <strong style="color: #e2e8f0;">${req.user.fullName}</strong> 
              has invited you to join a meeting on IntellMeet.
            </p>
            
            <div style="background: #1e293b; border-left: 4px solid #6366f1; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px;"><strong>Meeting:</strong> ${meeting.title}</p>
              <p style="margin: 0 0 16px;">
                <strong>Meeting Code:</strong><br/>
                <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #818cf8;">
                  ${meetingCode}
                </span>
              </p>
              <p style="margin: 0; color: #64748b; font-size: 13px;">
                ${new Date(meeting.scheduledAt).toLocaleString()}
              </p>
            </div>

            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 16px;">
              <strong>Option 1:</strong> Click the button below to join directly:
            </p>
            <a href="${directJoinLink}" 
               style="display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-bottom: 24px;">
              Join Meeting Now →
            </a>

            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">
              <strong>Option 2:</strong> Go to 
              <a href="${joinByCodeLink}" style="color: #818cf8;">${process.env.FRONTEND_URL}</a> 
              → Dashboard → "Join Room" → Enter code:
            </p>
            <p style="font-family: monospace; font-size: 22px; font-weight: bold; letter-spacing: 4px; color: #818cf8; margin: 0;">
              ${meetingCode}
            </p>
          </div>
        `,
      })
    )
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { joinLink: directJoinLink, meetingCode },
      "Invitations sent successfully"
    )
  );
});

export {
  // ... existing exports ...
  inviteToMeeting,
};
const getSingleMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  const meeting = await getMeetingById(meetingId);

  // FIX: Agar user host nahi hai aur participants mein bhi nahi hai
  // toh usse participant banao (direct URL join case)
  const userId = req.user._id;
  const isHost = meeting.host.equals(userId);
  const isParticipant = meeting.participants.some((p) => p.equals(userId));

  if (!isHost && !isParticipant) {
    // Active meeting mein direct URL se aaya — add karo
    if (meeting.status !== "ended" && meeting.status !== "cancelled") {
      meeting.participants.push(userId);
      await meeting.save();
    } else {
      throw new ApiError(403, "You do not have access to this meeting");
    }
  }

  const populated = await populateMeeting(
    Meeting.findById(meetingId)
  ).populate("actionItems.taskId", "title status priority");

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Meeting fetched successfully"));
});
const updateMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const { title, description, participants, scheduledAt, team, project } =
    req.body;

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    throw new ApiError(
      400,
      "Cannot update a meeting that has ended or been cancelled"
    );
  }

  if (title !== undefined) {
    const trimmed = title.trim();
    if (!trimmed) throw new ApiError(400, "Meeting title cannot be empty");
    if (trimmed.length < 2 || trimmed.length > 200) {
      throw new ApiError(
        400,
        "Meeting title must be between 2 and 200 characters"
      );
    }
    meeting.title = trimmed;
  }

  if (description !== undefined) {
    if (description.length > 3000) {
      throw new ApiError(400, "Description cannot exceed 3000 characters");
    }
    meeting.description = description.trim();
  }

  if (participants !== undefined) {
    if (!Array.isArray(participants)) {
      throw new ApiError(400, "participants must be an array");
    }
    const resolved = [
      ...new Set(
        participants
          .filter((id) => isValidObjectId(id))
          .map((id) => id.toString())
          .filter((id) => id !== req.user._id.toString())
      ),
    ];
    meeting.participants = resolved;
  }

  if (scheduledAt !== undefined) {
    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) {
      throw new ApiError(400, "scheduledAt must be a valid date");
    }
    meeting.scheduledAt = date;
  }

  if (team !== undefined) {
    if (team !== null) assertValidObjectId(team, "team");
    meeting.team = team || null;
  }

  if (project !== undefined) {
    if (project !== null) assertValidObjectId(project, "project");
    meeting.project = project || null;
  }

  await meeting.save();

  const populated = await populateMeeting(Meeting.findById(meetingId));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Meeting updated successfully"));
});

const deleteMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.status === "live") {
    throw new ApiError(400, "Cannot delete a meeting that is currently live");
  }

  meeting.isActive = false;
  await meeting.save();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Meeting deleted successfully"));
});


const startMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.status === "live") {
    throw new ApiError(400, "Meeting is already live");
  }
  if (meeting.status === "ended") {
    throw new ApiError(400, "Meeting has already ended");
  }
  if (meeting.status === "cancelled") {
    throw new ApiError(400, "Meeting has been cancelled");
  }

  meeting.status = "live";
  meeting.startedAt = new Date();
  await meeting.save();

  const populated = await populateMeeting(Meeting.findById(meetingId));

  const io = req.app.get("io");
  if (io) {
    io.to(`meeting:${meetingId}`).emit("meeting:started", {
      meetingId,
      startedAt: meeting.startedAt,
      hostId: req.user._id,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Meeting started successfully"));
});

const endMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.status === "ended") {
    throw new ApiError(400, "Meeting has already ended");
  }
  if (meeting.status === "scheduled") {
    throw new ApiError(400, "Meeting has not been started yet");
  }
  if (meeting.status === "cancelled") {
    throw new ApiError(400, "Meeting has been cancelled");
  }

  const endedAt = new Date();
  let durationMinutes = 0;

  if (meeting.startedAt) {
    durationMinutes = Math.round(
      (endedAt.getTime() - meeting.startedAt.getTime()) / 60000
    );
  }

  meeting.status = "ended";
  meeting.endedAt = endedAt;
  meeting.durationMinutes = durationMinutes;
  await meeting.save();
  

  const populated = await populateMeeting(Meeting.findById(meetingId));

  const io = req.app.get("io");
  if (io) {
    io.to(`meeting:${meetingId}`).emit("meeting:ended", {
      meetingId,
      endedAt: meeting.endedAt,
      durationMinutes,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Meeting ended successfully"));
});

const addTranscript = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const { transcript } = req.body;

  if (!transcript?.trim()) {
    throw new ApiError(400, "Transcript text is required");
  }

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.status !== "ended" && meeting.status !== "live") {
    throw new ApiError(
      400,
      "Transcript can only be added to a live or ended meeting"
    );
  }

  meeting.transcript = transcript.trim();
  await meeting.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        meetingId,
        transcriptLength: meeting.transcript.length,
        aiStatus: meeting.aiStatus,
      },
      "Transcript added successfully"
    )
  );
});

const addParticipant = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const { userId } = req.body;

  assertValidObjectId(userId, "userId");

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    throw new ApiError(400, "Cannot add participants to a closed meeting");
  }

  if (meeting.host.equals(userId)) {
    throw new ApiError(400, "Host is already part of the meeting");
  }

  const alreadyParticipant = meeting.participants.some((p) =>
    p.equals(userId)
  );
  if (alreadyParticipant) {
    throw new ApiError(409, "User is already a participant in this meeting");
  }

  meeting.participants.push(userId);
  await meeting.save();

  const populated = await populateMeeting(Meeting.findById(meetingId));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Participant added successfully"));
});

const removeParticipant = asyncHandler(async (req, res) => {
  const { meetingId, userId } = req.params;

  assertValidObjectId(userId, "userId");

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.host.equals(userId)) {
    throw new ApiError(400, "Host cannot be removed from the meeting");
  }

  const participantIndex = meeting.participants.findIndex((p) =>
    p.equals(userId)
  );
  if (participantIndex === -1) {
    throw new ApiError(404, "User is not a participant in this meeting");
  }

  meeting.participants.splice(participantIndex, 1);
  await meeting.save();

  const populated = await populateMeeting(Meeting.findById(meetingId));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Participant removed successfully"));
});

const cancelMeeting = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  if (meeting.status === "live") {
    throw new ApiError(
      400,
      "Cannot cancel a live meeting. End the meeting first."
    );
  }
  if (meeting.status === "ended") {
    throw new ApiError(400, "Meeting has already ended");
  }
  if (meeting.status === "cancelled") {
    throw new ApiError(400, "Meeting is already cancelled");
  }

  meeting.status = "cancelled";
  await meeting.save();

  const populated = await populateMeeting(Meeting.findById(meetingId));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Meeting cancelled successfully"));
});

// meeting.controller.js mein getMeetingByCode update karo

const getMeetingByCode = asyncHandler(async (req, res) => {
  const { code } = req.params;

  if (!code?.trim()) throw new ApiError(400, "Meeting code is required");

  const meeting = await Meeting.findOne({
    meetingCode: code.trim().toUpperCase(),
    isActive: true,
  });

  if (!meeting) throw new ApiError(404, "Meeting not found with this code");

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    throw new ApiError(400, "This meeting is no longer active");
  }

  // FIX: Joining user ko participants mein add karo (agar already nahi hai)
  const userId = req.user._id;
  const isAlreadyParticipant =
    meeting.host.equals(userId) ||
    meeting.participants.some((p) => p.equals(userId));

  if (!isAlreadyParticipant) {
    meeting.participants.push(userId);
    await meeting.save();
  }

  const populated = await populateMeeting(Meeting.findById(meeting._id));

  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Meeting fetched successfully"));
});
import { uploadAudio } from "../services/storage.service.js";
import fs from "fs";

const uploadRecording = asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  if (!req.file) throw new ApiError(400, "Recording file is required");

  const meeting = await getMeetingById(meetingId);
  assertMeetingHost(meeting, req.user._id);

  const localFilePath = req.file.path;

  // FIX: Pehle AI processing ke liye file ka copy bana lo
  // kyunki uploadAudio() original file delete kar dega
  const fs = await import("fs");
  const path = await import("path");

  const aiCopyPath = path.join(
    path.dirname(localFilePath),
    `ai-copy-${path.basename(localFilePath)}`
  );
  fs.copyFileSync(localFilePath, aiCopyPath);

  // Cloudinary upload (yeh original file delete kar dega)
  const { uploadAudio } = await import("../services/storage.service.js");
  const uploaded = await uploadAudio(localFilePath, meetingId);

  meeting.recordingUrl = uploaded.url;
  meeting.isRecorded = true;
  await meeting.save();

  // FIX: AI processing ko copy wali file do (jo abhi exist karti hai)
  const aiService = await import("../services/ai.service.js");

  aiService.processMeetingAI(meetingId, aiCopyPath)
    .then((result) => {
      const io = req.app.get("io");
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
      console.error(`AI auto-processing failed for ${meetingId}:`, err.message);
      // Cleanup agar AI fail ho jaye
      if (fs.existsSync(aiCopyPath)) {
        try { fs.unlinkSync(aiCopyPath); } catch {}
      }
    });

  return res.status(200).json(
    new ApiResponse(200, { recordingUrl: uploaded.url }, "Recording uploaded successfully. AI processing started automatically.")
  );
});

export {
  createMeeting,
  getAllMeetings,
  getSingleMeeting,
  updateMeeting,
  deleteMeeting,
  startMeeting,
  endMeeting,
  addTranscript,
  addParticipant,
  removeParticipant,
  cancelMeeting,
  getMeetingByCode,
  uploadRecording
};
