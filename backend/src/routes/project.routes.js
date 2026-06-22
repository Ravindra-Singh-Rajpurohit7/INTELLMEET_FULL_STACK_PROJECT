// src/routes/project.routes.js
import { Router } from "express";
import { body, param, query } from "express-validator";
import {
  createProject,
  getProjects,
  getSingleProject,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
} from "../controllers/project.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post(
  "/",
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Project name is required")
      .isLength({ min: 2, max: 100 })
      .withMessage("Project name must be between 2 and 100 characters"),
    body("teamId")
      .notEmpty()
      .withMessage("teamId is required")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 1000 })
      .withMessage("Description cannot exceed 1000 characters"),
    body("color")
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage("Color must be a valid hex color code"),
    body("icon")
      .optional()
      .isString()
      .withMessage("Icon must be a string"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Priority must be one of: low, medium, high, critical"),
    body("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be a valid ISO 8601 date"),
    body("dueDate")
      .optional()
      .isISO8601()
      .withMessage("dueDate must be a valid ISO 8601 date"),
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
  createProject
);

router.get(
  "/",
  [
    query("teamId")
      .optional()
      .isMongoId()
      .withMessage("Invalid teamId format"),
    query("status")
      .optional()
      .isIn(["planning", "active", "on_hold", "completed", "archived"])
      .withMessage("Invalid status value"),
    query("priority")
      .optional()
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Invalid priority value"),
    validate,
  ],
  getProjects
);

router.get(
  "/:projectId",
  [
    param("projectId")
      .isMongoId()
      .withMessage("Invalid projectId format"),
    validate,
  ],
  getSingleProject
);

router.patch(
  "/:projectId",
  [
    param("projectId")
      .isMongoId()
      .withMessage("Invalid projectId format"),
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Project name must be between 2 and 100 characters"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 1000 })
      .withMessage("Description cannot exceed 1000 characters"),
    body("color")
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage("Color must be a valid hex color code"),
    body("icon")
      .optional()
      .isString()
      .withMessage("Icon must be a string"),
    body("status")
      .optional()
      .isIn(["planning", "active", "on_hold", "completed", "archived"])
      .withMessage("Invalid status value"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Invalid priority value"),
    body("startDate")
      .optional({ nullable: true })
      .isISO8601()
      .withMessage("startDate must be a valid ISO 8601 date"),
    body("dueDate")
      .optional({ nullable: true })
      .isISO8601()
      .withMessage("dueDate must be a valid ISO 8601 date"),
    body("columns")
      .optional()
      .isArray({ min: 1 })
      .withMessage("columns must be a non-empty array"),
    body("columns.*")
      .optional()
      .isString()
      .withMessage("Each column must be a string"),
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
  updateProject
);

router.delete(
  "/:projectId",
  [
    param("projectId")
      .isMongoId()
      .withMessage("Invalid projectId format"),
    validate,
  ],
  deleteProject
);

router.post(
  "/:projectId/members",
  [
    param("projectId")
      .isMongoId()
      .withMessage("Invalid projectId format"),
    body("userId")
      .notEmpty()
      .withMessage("userId is required")
      .isMongoId()
      .withMessage("Invalid userId format"),
    body("role")
      .optional()
      .isIn(["manager", "developer", "viewer"])
      .withMessage("Role must be one of: manager, developer, viewer"),
    validate,
  ],
  addProjectMember
);

router.delete(
  "/:projectId/members/:memberId",
  [
    param("projectId")
      .isMongoId()
      .withMessage("Invalid projectId format"),
    param("memberId")
      .isMongoId()
      .withMessage("Invalid memberId format"),
    validate,
  ],
  removeProjectMember
);

router.patch(
  "/:projectId/members/:memberId/role",
  [
    param("projectId")
      .isMongoId()
      .withMessage("Invalid projectId format"),
    param("memberId")
      .isMongoId()
      .withMessage("Invalid memberId format"),
    body("role")
      .notEmpty()
      .withMessage("role is required")
      .isIn(["manager", "developer", "viewer"])
      .withMessage("Role must be one of: manager, developer, viewer"),
    validate,
  ],
  updateProjectMemberRole
);

export default router;