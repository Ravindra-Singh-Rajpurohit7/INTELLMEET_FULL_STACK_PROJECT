// src/routes/team.routes.js
import { Router } from "express";
import { body, param } from "express-validator";
import {
  createTeam,
  getTeams,
  getSingleTeam,
  updateTeam,
  deleteTeam,
  inviteMember,
  joinTeam,
  removeMember,
  updateMemberRole,
} from "../controllers/team.controller.js";
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
      .withMessage("Team name is required")
      .isLength({ min: 2, max: 50 })
      .withMessage("Team name must be between 2 and 50 characters"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 500 })
      .withMessage("Description cannot exceed 500 characters"),
    validate,
  ],
  createTeam
);

router.get("/", getTeams);

router.post(
  "/join",
  [
    body("token")
      .notEmpty()
      .withMessage("token is required")
      .isString()
      .withMessage("token must be a string"),
    body("teamId")
      .notEmpty()
      .withMessage("teamId is required")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    validate,
  ],
  joinTeam
);

router.get(
  "/:teamId",
  [
    param("teamId")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    validate,
  ],
  getSingleTeam
);

router.patch(
  "/:teamId",
  [
    param("teamId")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Team name cannot be empty")
      .isLength({ min: 2, max: 50 })
      .withMessage("Team name must be between 2 and 50 characters"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 500 })
      .withMessage("Description cannot exceed 500 characters"),
    body("settings")
      .optional()
      .isObject()
      .withMessage("settings must be an object"),
    body("settings.allowMemberInvite")
      .optional()
      .isBoolean()
      .withMessage("settings.allowMemberInvite must be a boolean"),
    body("settings.isPublic")
      .optional()
      .isBoolean()
      .withMessage("settings.isPublic must be a boolean"),
    validate,
  ],
  updateTeam
);

router.delete(
  "/:teamId",
  [
    param("teamId")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    validate,
  ],
  deleteTeam
);

router.post(
  "/:teamId/invite",
  [
    param("teamId")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Must be a valid email address")
      .normalizeEmail(),
    body("role")
      .optional()
      .isIn(["admin", "member"])
      .withMessage("Role must be 'admin' or 'member'"),
    validate,
  ],
  inviteMember
);

router.delete(
  "/:teamId/members/:memberId",
  [
    param("teamId")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    param("memberId")
      .isMongoId()
      .withMessage("Invalid memberId format"),
    validate,
  ],
  removeMember
);

router.patch(
  "/:teamId/members/:memberId/role",
  [
    param("teamId")
      .isMongoId()
      .withMessage("Invalid teamId format"),
    param("memberId")
      .isMongoId()
      .withMessage("Invalid memberId format"),
    body("role")
      .notEmpty()
      .withMessage("role is required")
      .isIn(["admin", "member"])
      .withMessage("Role must be 'admin' or 'member'"),
    validate,
  ],
  updateMemberRole
);

export default router;