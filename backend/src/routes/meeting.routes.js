// src/routes/meeting.routes.js
import { Router } from "express";
import { body, param, query } from "express-validator";
import {
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
} from "../controllers/meeting.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post(
  "/",
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Meeting title is required")
      .isLength({ min: 2, max: 200 })
      .withMessage("Meeting title must be between 2 and 200 characters"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 3000 })
      .withMessage("Description cannot exceed 3000 characters"),
    body("participants")
      .optional()
      .isArray()
      .withMessage("participants must be an array"),
    body("participants.*")
      .optional()
      .isMongoId()
      .withMessage("Each participant must be a valid MongoDB ID"),
    body("team")
      .optional()
      .isMongoId()
      .withMessage("Invalid team ID format"),
    body("project")
      .optional()
      .isMongoId()
      .withMessage("Invalid project ID format"),
    body("scheduledAt")
      .optional()
      .isISO8601()
      .withMessage("scheduledAt must be a valid ISO 8601 date"),
    validate,
  ],
  createMeeting
);

router.get(
  "/",
  [
    query("status")
      .optional()
      .isIn(["scheduled", "live", "ended", "cancelled"])
      .withMessage(
        "Invalid status. Must be one of: scheduled, live, ended, cancelled"
      ),
    query("team")
      .optional()
      .isMongoId()
      .withMessage("Invalid team ID format"),
    query("project")
      .optional()
      .isMongoId()
      .withMessage("Invalid project ID format"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit must be between 1 and 100"),
    validate,
  ],
  getAllMeetings
);

router.get(
  "/code/:code",
  [
    param("code")
      .trim()
      .notEmpty()
      .withMessage("Meeting code is required")
      .isLength({ min: 9, max: 11 })
      .withMessage("Invalid meeting code format"),
    validate,
  ],
  getMeetingByCode
);

router.get(
  "/:meetingId",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  getSingleMeeting
);

router.patch(
  "/:meetingId",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    body("title")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Meeting title cannot be empty")
      .isLength({ min: 2, max: 200 })
      .withMessage("Meeting title must be between 2 and 200 characters"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 3000 })
      .withMessage("Description cannot exceed 3000 characters"),
    body("participants")
      .optional()
      .isArray()
      .withMessage("participants must be an array"),
    body("participants.*")
      .optional()
      .isMongoId()
      .withMessage("Each participant must be a valid MongoDB ID"),
    body("scheduledAt")
      .optional()
      .isISO8601()
      .withMessage("scheduledAt must be a valid ISO 8601 date"),
    body("team")
      .optional({ nullable: true })
      .custom((val) => {
        if (val === null) return true;
        if (!mongoose.Types.ObjectId.isValid(val)) {
          throw new Error("Invalid team ID format");
        }
        return true;
      }),
    body("project")
      .optional({ nullable: true })
      .custom((val) => {
        if (val === null) return true;
        if (!mongoose.Types.ObjectId.isValid(val)) {
          throw new Error("Invalid project ID format");
        }
        return true;
      }),
    validate,
  ],
  updateMeeting
);

router.delete(
  "/:meetingId",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  deleteMeeting
);

router.post(
  "/:meetingId/start",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  startMeeting
);

router.post(
  "/:meetingId/end",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  endMeeting
);

router.post(
  "/:meetingId/cancel",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    validate,
  ],
  cancelMeeting
);

router.post(
  "/:meetingId/transcript",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    body("transcript")
      .trim()
      .notEmpty()
      .withMessage("Transcript text is required")
      .isLength({ min: 10 })
      .withMessage("Transcript must be at least 10 characters"),
    validate,
  ],
  addTranscript
);

router.post(
  "/:meetingId/participants",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    body("userId")
      .notEmpty()
      .withMessage("userId is required")
      .isMongoId()
      .withMessage("Invalid userId format"),
    validate,
  ],
  addParticipant
);

router.delete(
  "/:meetingId/participants/:userId",
  [
    param("meetingId")
      .isMongoId()
      .withMessage("Invalid meetingId format"),
    param("userId")
      .isMongoId()
      .withMessage("Invalid userId format"),
    validate,
  ],
  removeParticipant
);

export default router;