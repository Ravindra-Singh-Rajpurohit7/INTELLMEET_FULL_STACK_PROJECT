// src/routes/user.routes.js
import { Router } from "express";
import { param, body, query } from "express-validator";
import multer from "multer";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  searchUsers,
  getUserById,
  updatePreferences,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

// Multer for avatar — disk storage
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = "uploads/avatars";
      import("fs").then(({ default: fs }) => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      });
    },
    filename: (req, file, cb) => {
      const ext = file.originalname.split(".").pop();
      cb(null, `avatar-${Date.now()}.${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed for avatar"));
  },
});

router.use(verifyJWT);

router.get("/search", [
  query("q")
    .trim()
    .notEmpty()
    .withMessage("Search query is required")
    .isLength({ min: 2 })
    .withMessage("Minimum 2 characters"),
  validate,
], searchUsers);

router.get("/profile", getProfile);

router.put("/profile", [
  body("fullName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Full name must be 2-50 characters"),
  body("bio")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Bio max 200 characters"),
  validate,
], updateProfile);

router.post(
  "/avatar",
  avatarUpload.single("avatar"),
  uploadAvatar
);

router.patch("/preferences", [
  body("theme")
    .optional()
    .isIn(["light", "dark", "system"])
    .withMessage("Theme must be light, dark, or system"),
  validate,
], updatePreferences);

router.get("/:userId", [
  param("userId").isMongoId().withMessage("Invalid userId format"),
  validate,
], getUserById);

export default router;