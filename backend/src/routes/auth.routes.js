import { Router } from "express";
import { body } from "express-validator";
import {
  signup,
  login,
  logout,
  refreshAccessToken,
  getCurrentUser,
  changePassword,
  forgotPassword,   // ← ADD
  resetPassword,    // ← ADD
} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  authRateLimit,
  refreshRateLimit,
} from "../middleware/rateLimit.middleware.js";

const router = Router();

// ═══════════════════════════════════════════════════════
// PUBLIC ROUTES (No authentication required)
// ═══════════════════════════════════════════════════════

/**
 * POST /api/v1/auth/signup
 * Register a new user account
 */
router.post(
  "/signup",
  authRateLimit, // Max 5 attempts per 15 min
  [
    body("fullName")
      .trim()
      .notEmpty()
      .withMessage("Full name is required")
      .isLength({ min: 2, max: 50 })
      .withMessage("Name must be between 2 and 50 characters"),

    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Please enter a valid email address")
      .normalizeEmail(),

    body("password")
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters")
      .matches(/\d/)
      .withMessage("Password must contain at least one number"),

    validate, // Check validation results
  ],
  signup
);

/**
 * POST /api/v1/auth/login
 * Login with email and password
 */
router.post(
  "/login",
  authRateLimit,
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Please enter a valid email address")
      .normalizeEmail(),

    body("password")
      .notEmpty()
      .withMessage("Password is required"),

    validate,
  ],
  login
);

/**
 * POST /api/v1/auth/refresh-token
 * Get new access token using refresh token
 */
router.post("/refresh-token", refreshRateLimit, refreshAccessToken);



// Existing routes ke saath add karo (verifyJWT se PEHLE — public routes)

router.post(
  "/forgot-password",
  authRateLimit,
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Please enter a valid email")
      .normalizeEmail(),
    validate,
  ],
  forgotPassword
);

router.post(
  "/reset-password",
  [
    body("token")
      .notEmpty()
      .withMessage("Reset token is required"),
    body("password")
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters")
      .matches(/\d/)
      .withMessage("Password must contain at least one number"),
    validate,
  ],
  resetPassword
);

// ... existing routes (verifyJWT wale)

// ═══════════════════════════════════════════════════════
// PROTECTED ROUTES (Authentication required)
// verifyJWT middleware checks the token
// ═══════════════════════════════════════════════════════

/**
 * POST /api/v1/auth/logout
 * Logout current user
 */
router.post("/logout", verifyJWT, logout);

/**
 * GET /api/v1/auth/me
 * Get currently logged in user's profile
 */
router.get("/me", verifyJWT, getCurrentUser);

/**
 * POST /api/v1/auth/change-password
 * Change password for logged in user
 */
router.post(
  "/change-password",
  verifyJWT,
  [
    body("oldPassword")
      .notEmpty()
      .withMessage("Current password is required"),

    body("newPassword")
      .notEmpty()
      .withMessage("New password is required")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters")
      .matches(/\d/)
      .withMessage("New password must contain at least one number"),

    validate,
  ],
  changePassword
);

export default router;