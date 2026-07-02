import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import User from "../models/User.js";

// ─── COOKIE OPTIONS ───────────────────────────────────
// Centralized cookie configuration
// Used for both setting and clearing cookies
const COOKIE_OPTIONS = {
  httpOnly: true, // JS cannot access this cookie (XSS protection)
  secure: process.env.NODE_ENV === "production", // HTTPS only in production
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

// ─── HELPER: Generate Tokens & Save ──────────────────
/**
 * Generates both access and refresh tokens for a user.
 * Saves refresh token to DB and returns both tokens.
 *
 * @param {string} userId - MongoDB user _id
 * @returns {{ accessToken, refreshToken }}
 */
const generateAndSaveTokens = async (userId) => {
  // Find user (need full document for methods)
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(500, "User not found while generating tokens");
  }

  // Generate both tokens using model methods
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Save refresh token to database
  // validateBeforeSave: false → skip validation (we only updating one field)
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

// ═══════════════════════════════════════════════════════
// SIGNUP CONTROLLER
// POST /api/v1/auth/signup
// ═══════════════════════════════════════════════════════
const signup = asyncHandler(async (req, res) => {
  // ─── Step 1: Extract Data ───────────────────────────
  const { fullName, email, password } = req.body;

  // ─── Step 2: Check if User Already Exists ──────────
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(
      409,
      "An account with this email already exists. Please login or use a different email."
    );
  }

  // ─── Step 3: Create User ────────────────────────────
  // Password hashing happens in pre-save hook (User.js)
  const user = await User.create({
    fullName,
    email,
    password,
  });

  // ─── Step 4: Fetch Created User (without password) ──
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "User creation failed. Please try again.");
  }

  // ─── Step 5: Generate Tokens ────────────────────────
  const { accessToken, refreshToken } = await generateAndSaveTokens(user._id);

  // ─── Step 6: Return Response ─────────────────────────
  return res
    .status(201)
    .cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
    .json(
      new ApiResponse(
        201,
        {
          user: createdUser,
          accessToken,
        },
        "Account created successfully! Welcome to IntellMeet."
      )
    );
});

// ═══════════════════════════════════════════════════════
// LOGIN CONTROLLER
// POST /api/v1/auth/login
// ═══════════════════════════════════════════════════════
const login = asyncHandler(async (req, res) => {
  // ─── Step 1: Extract Data ───────────────────────────
  const { email, password } = req.body;

  // ─── Step 2: Find User ──────────────────────────────
  // Must explicitly select password (select: false in schema)
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    // Security: Don't reveal whether email exists
    throw new ApiError(
      401,
      "Invalid email or password. Please check your credentials."
    );
  }

  // ─── Step 3: Check Account Status ──────────────────
  if (!user.isActive) {
    throw new ApiError(
      403,
      "Your account has been deactivated. Please contact support."
    );
  }

  // ─── Step 4: Verify Password ────────────────────────
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(
      401,
      "Invalid email or password. Please check your credentials."
    );
  }

  // ─── Step 5: Generate Tokens ────────────────────────
  const { accessToken, refreshToken } = await generateAndSaveTokens(user._id);

  // ─── Step 6: Update User Activity ──────────────────
  await User.findByIdAndUpdate(user._id, {
    isOnline: true,
    lastSeen: new Date(),
    loginAttempts: 0, // Reset failed attempts
  });

  // ─── Step 7: Fetch Clean User Data ──────────────────
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // ─── Step 8: Return Response ─────────────────────────
  return res
    .status(200)
    .cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
        },
        "Login successful! Welcome back."
      )
    );
});

// ═══════════════════════════════════════════════════════
// LOGOUT CONTROLLER
// POST /api/v1/auth/logout
// ═══════════════════════════════════════════════════════
const logout = asyncHandler(async (req, res) => {
  // ─── Step 1: Remove Refresh Token from DB ──────────
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: { refreshToken: 1 }, // Remove field completely
      isOnline: false,
      lastSeen: new Date(),
    },
    { new: true }
  );

  // ─── Step 2: Clear Cookie & Return ─────────────────
  return res
    .status(200)
    .clearCookie("refreshToken", COOKIE_OPTIONS)
    .json(new ApiResponse(200, {}, "Logged out successfully. See you soon!"));
});

// ═══════════════════════════════════════════════════════
// REFRESH ACCESS TOKEN CONTROLLER
// POST /api/v1/auth/refresh-token
// ═══════════════════════════════════════════════════════
const refreshAccessToken = asyncHandler(async (req, res) => {
  // ─── Step 1: Get Refresh Token ─────────────────────
  // Comes from httpOnly cookie (browser sends automatically)
  // or from body (for mobile apps)
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(
      401,
      "Refresh token is missing. Please login again."
    );
  }

  // ─── Step 2: Verify Refresh Token ──────────────────
  let decodedToken;
  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (error) {
    throw new ApiError(
      401,
      "Refresh token is invalid or expired. Please login again."
    );
  }

  // ─── Step 3: Find User & Verify Token Match ─────────
  const user = await User.findById(decodedToken?._id).select("+refreshToken");

  if (!user) {
    throw new ApiError(401, "User not found. Please login again.");
  }

  // Check if stored refresh token matches incoming one
  // Security: If they don't match, possible token theft
  if (incomingRefreshToken !== user?.refreshToken) {
    throw new ApiError(
      401,
      "Refresh token is invalid or already used. Please login again."
    );
  }

  // ─── Step 4: Generate New Token Pair ────────────────
  // Token Rotation: Generate NEW refresh token each time
  // This invalidates the old refresh token
  const { accessToken, refreshToken: newRefreshToken } =
    await generateAndSaveTokens(user._id);

  // ─── Step 5: Return New Tokens ──────────────────────
  return res
    .status(200)
    .cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS)
    .json(
      new ApiResponse(
        200,
        { accessToken },
        "Access token refreshed successfully."
      )
    );
});

// ═══════════════════════════════════════════════════════
// GET CURRENT USER
// GET /api/v1/auth/me
// ═══════════════════════════════════════════════════════
const getCurrentUser = asyncHandler(async (req, res) => {
  // req.user is set by verifyJWT middleware
  return res
    .status(200)
    .json(
      new ApiResponse(200, { user: req.user }, "Current user fetched successfully.")
    );
});

// ═══════════════════════════════════════════════════════
// CHANGE PASSWORD
// POST /api/v1/auth/change-password
// ═══════════════════════════════════════════════════════
const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  // Fetch user with password
  const user = await User.findById(req.user?._id).select("+password");

  // Verify old password
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Current password is incorrect.");
  }

  if (oldPassword === newPassword) {
    throw new ApiError(
      400,
      "New password must be different from current password."
    );
  }

  // Update password (pre-save hook will hash it)
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully."));
});

// Need jwt import for refreshAccessToken
import jwt from "jsonwebtoken";



// auth.controller.js mein yeh 2 functions add karo (existing exports ke saath)
import crypto from "crypto";

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email?.trim()) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  // Security: Same response whether user exists or not
  if (!user) {
    return res.status(200).json(
      new ApiResponse(200, {}, "If this email exists, a reset link has been sent.")
    );
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  user.passwordResetToken = resetToken;
  user.passwordResetExpiry = resetTokenExpiry;
  await user.save({ validateBeforeSave: false });

  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  // Email bhejo
  const { sendEmail } = await import("../services/email.service.js");
  await sendEmail({
    to: user.email,
    subject: "Password Reset Request — IntellMeet",
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px;">
        <h2 style="color:#818cf8;">Reset Your Password 🔐</h2>
        <p>You requested a password reset for your IntellMeet account.</p>
        <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetLink}"
           style="display:inline-block;background:#6366f1;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0;">
          Reset Password →
        </a>
        <p style="color:#64748b;font-size:13px;margin-top:20px;">
          If you didn't request this, ignore this email. Your password won't change.
        </p>
      </div>
    `,
  }).catch((err) => console.error("Reset email failed:", err.message));

  return res.status(200).json(
    new ApiResponse(200, {}, "If this email exists, a reset link has been sent.")
  );
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token) throw new ApiError(400, "Reset token is required");
  if (!password || password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  // DEBUG LOGS — temporarily add karo
  console.log("=== RESET PASSWORD DEBUG ===");
  console.log("Token received from frontend:", token);

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpiry: { $gt: new Date() },
  });

  console.log("User found:", !!user);

  // Agar user nahi mila, check karo kya token DB mein exist karta hai bina expiry check ke
  if (!user) {
    const anyUser = await User.findOne({ passwordResetToken: token });
    console.log("User found WITHOUT expiry check:", !!anyUser);
    if (anyUser) {
      console.log("Token expiry in DB:", anyUser.passwordResetExpires);
      console.log("Current time:", new Date());
    }
  }

  if (!user) {
    throw new ApiError(400, "Invalid or expired reset token. Please request a new one.");
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = undefined;
  await user.save();

  return res.status(200).json(
    new ApiResponse(200, {}, "Password reset successfully. Please login with your new password.")
  );
});

// Existing exports mein add karo:
export {
  signup,
  login,
  logout,
  refreshAccessToken,
  getCurrentUser,
  changePassword,
  forgotPassword,   // ← ADD
  resetPassword,    // ← ADD
};