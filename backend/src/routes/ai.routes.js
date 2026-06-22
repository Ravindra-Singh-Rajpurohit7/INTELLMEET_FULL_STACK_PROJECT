// src/routes/ai.routes.js
import { Router } from "express";
import { body, param } from "express-validator";
import {
  transcribeAudio,
  analyzeMeetingTranscript,
  generateSmartNotes,
  processMeetingAI,
  breakdownTask,
  getMeetingAIStatus,
  getMeetingSummary,
} from "../controllers/ai.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { aiRateLimit } from "../middleware/rateLimit.middleware.js";
import { audioUpload } from "../middleware/upload.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post(
  "/transcribe",
  aiRateLimit,
  audioUpload.single("audio"),
  [
    body("meetingId")
      .optional()
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  transcribeAudio
);

router.post(
  "/analyze-transcript",
  aiRateLimit,
  [
    body("transcript")
      .notEmpty()
      .withMessage("Transcript text is required")
      .isLength({ min: 100 })
      .withMessage("Transcript must be at least 100 characters"),
    body("meetingTitle")
      .notEmpty()
      .withMessage("Meeting title is required")
      .isLength({ max: 200 })
      .withMessage("Meeting title cannot exceed 200 characters"),
    body("meetingId")
      .optional()
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  analyzeMeetingTranscript
);

router.post(
  "/smart-notes",
  aiRateLimit,
  [
    body("transcript")
      .notEmpty()
      .withMessage("Transcript text is required")
      .isLength({ min: 100 })
      .withMessage("Transcript must be at least 100 characters"),
    body("meetingId")
      .optional()
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  generateSmartNotes
);

router.post(
  "/process-meeting",
  aiRateLimit,
  audioUpload.single("audio"),
  [
    body("meetingId")
      .notEmpty()
      .withMessage("meetingId is required")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  processMeetingAI
);

router.post(
  "/breakdown-task",
  aiRateLimit,
  [
    body("taskTitle")
      .notEmpty()
      .withMessage("Task title is required")
      .isLength({ max: 200 })
      .withMessage("Task title cannot exceed 200 characters"),
    body("taskDescription")
      .optional()
      .isString()
      .withMessage("taskDescription must be a string")
      .isLength({ max: 2000 })
      .withMessage("taskDescription cannot exceed 2000 characters"),
    body("taskId")
      .optional()
      .isMongoId()
      .withMessage("Invalid taskId format"),
    validate,
  ],
  breakdownTask
);

router.get(
  "/status/:meetingId",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  getMeetingAIStatus
);

router.get(
  "/summary/:meetingId",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  getMeetingSummary
);

export default router;