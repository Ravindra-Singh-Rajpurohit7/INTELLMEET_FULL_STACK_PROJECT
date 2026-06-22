// src/routes/task.routes.js
import { Router } from "express";
import { body, param, query } from "express-validator";
import {
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
} from "../controllers/task.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { documentUpload } from "../middleware/upload.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post(
  "/",
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Task title is required")
      .isLength({ max: 200 })
      .withMessage("Task title cannot exceed 200 characters"),
    body("projectId")
      .notEmpty()
      .withMessage("projectId is required")
      .isMongoId()
      .withMessage("Invalid projectId format"),
    body("teamId")
      .notEmpty()
      .withMessage("teamId is required")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 5000 })
      .withMessage("Description cannot exceed 5000 characters"),
    body("status")
      .optional()
      .isIn(["backlog", "todo", "in_progress", "review", "done"])
      .withMessage("Invalid status value"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high", "urgent"])
      .withMessage("Invalid priority value"),
    body("assignedTo")
      .optional()
      .isArray()
      .withMessage("assignedTo must be an array"),
    body("assignedTo.*")
      .optional()
      .isMongoId()
      .withMessage("Each assignedTo entry must be a valid MongoDB ID"),
    body("dueDate")
      .optional()
      .isISO8601()
      .withMessage("dueDate must be a valid ISO 8601 date"),
    body("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be a valid ISO 8601 date"),
    body("estimatedHours")
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage("estimatedHours must be a number between 0 and 1000"),
    body("tags")
      .optional()
      .isArray()
      .withMessage("tags must be an array"),
    body("tags.*")
      .optional()
      .isString()
      .isLength({ max: 30 })
      .withMessage("Each tag cannot exceed 30 characters"),
    validate,
  ],
  createTask
);

router.get(
  "/",
  [
    query("projectId")
      .optional()
      .isMongoId()
      .withMessage("Invalid projectId format"),
    query("teamId")
      .optional()
      .isMongoId()
      .withMessage("Invalid teamId format"),
    query("status")
      .optional()
      .isIn(["backlog", "todo", "in_progress", "review", "done"])
      .withMessage("Invalid status value"),
    query("priority")
      .optional()
      .isIn(["low", "medium", "high", "urgent"])
      .withMessage("Invalid priority value"),
    query("assignedTo")
      .optional()
      .custom((val) => {
        if (val === "me") return true;
        if (/^[a-fA-F0-9]{24}$/.test(val)) return true;
        throw new Error("assignedTo must be 'me' or a valid MongoDB ID");
      }),
    query("aiGenerated")
      .optional()
      .isIn(["true", "false"])
      .withMessage("aiGenerated must be 'true' or 'false'"),
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
  getTasks
);

router.get(
  "/:taskId",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    validate,
  ],
  getSingleTask
);

router.patch(
  "/:taskId",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    body("title")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Task title cannot be empty")
      .isLength({ max: 200 })
      .withMessage("Task title cannot exceed 200 characters"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 5000 })
      .withMessage("Description cannot exceed 5000 characters"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high", "urgent"])
      .withMessage("Invalid priority value"),
    body("dueDate")
      .optional({ nullable: true })
      .isISO8601()
      .withMessage("dueDate must be a valid ISO 8601 date"),
    body("startDate")
      .optional({ nullable: true })
      .isISO8601()
      .withMessage("startDate must be a valid ISO 8601 date"),
    body("estimatedHours")
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage("estimatedHours must be a number between 0 and 1000"),
    body("actualHours")
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage("actualHours must be a number between 0 and 1000"),
    body("tags")
      .optional()
      .isArray()
      .withMessage("tags must be an array"),
    body("tags.*")
      .optional()
      .isString()
      .isLength({ max: 30 })
      .withMessage("Each tag cannot exceed 30 characters"),
    body("checklist")
      .optional()
      .isArray()
      .withMessage("checklist must be an array"),
    body("checklist.*.text")
      .optional()
      .isString()
      .notEmpty()
      .isLength({ max: 200 })
      .withMessage("Each checklist item text must be a non-empty string under 200 characters"),
    body("checklist.*.completed")
      .optional()
      .isBoolean()
      .withMessage("checklist item completed must be a boolean"),
    validate,
  ],
  updateTask
);

router.delete(
  "/:taskId",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    validate,
  ],
  deleteTask
);

router.patch(
  "/:taskId/status",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    body("status")
      .notEmpty()
      .withMessage("status is required")
      .isIn(["backlog", "todo", "in_progress", "review", "done"])
      .withMessage("Invalid status value"),
    body("order")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("order must be a non-negative number"),
    validate,
  ],
  changeStatus
);

router.patch(
  "/:taskId/assignees",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    body("userIds")
      .isArray()
      .withMessage("userIds must be an array"),
    body("userIds.*")
      .isMongoId()
      .withMessage("Each userId must be a valid MongoDB ID"),
    validate,
  ],
  assignMembers
);

router.post(
  "/:taskId/attachments",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    validate,
  ],
  documentUpload.single("file"),
  uploadAttachment
);

router.delete(
  "/:taskId/attachments/:attachmentId",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    param("attachmentId")
      .isMongoId()
      .withMessage("Invalid attachmentId format"),
    validate,
  ],
  removeAttachment
);

router.patch(
  "/:taskId/checklist/:itemId",
  [
    param("taskId")
      .isMongoId()
      .withMessage("Invalid taskId format"),
    param("itemId")
      .isMongoId()
      .withMessage("Invalid itemId format"),
    body("completed")
      .notEmpty()
      .withMessage("completed is required")
      .isBoolean()
      .withMessage("completed must be a boolean"),
    validate,
  ],
  updateChecklistItem
);

export default router;