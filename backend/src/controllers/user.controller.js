// src/controllers/user.controller.js
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../config/cloudinary.js";
import { deleteCache, CACHE_KEYS } from "../config/redis.js";

/**
 * GET /api/v1/users/profile
 * Get logged-in user's profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -emailVerificationToken -passwordResetToken"
  );

  if (!user) throw new ApiError(404, "User not found");

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "Profile fetched successfully"));
});

/**
 * PUT /api/v1/users/profile
 * Update logged-in user's profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, bio } = req.body;

  const updateFields = {};
  if (fullName !== undefined) {
    const trimmed = fullName.trim();
    if (!trimmed) throw new ApiError(400, "Full name cannot be empty");
    if (trimmed.length < 2 || trimmed.length > 50) {
      throw new ApiError(400, "Full name must be between 2 and 50 characters");
    }
    updateFields.fullName = trimmed;
  }

  if (bio !== undefined) {
    if (bio.length > 200) {
      throw new ApiError(400, "Bio cannot exceed 200 characters");
    }
    updateFields.bio = bio.trim();
  }

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  // Invalidate cache
  await deleteCache(CACHE_KEYS.user(req.user._id.toString()));

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "Profile updated successfully"));
});

/**
 * POST /api/v1/users/avatar
 * Upload avatar image
 */
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "Avatar image is required");

  const localPath = req.file.path;

  const uploaded = await uploadOnCloudinary(localPath, {
    folder: "intellmeet/avatars",
    resourceType: "image",
    transformation: [
      {
        width: 400,
        height: 400,
        crop: "fill",
        gravity: "face",
        quality: "auto:good",
        fetch_format: "auto",
      },
    ],
  });

  // Delete old avatar from Cloudinary if exists
  if (req.user.avatar && req.user.avatar.includes("cloudinary")) {
    const oldPublicId = req.user.avatar
      .split("/")
      .slice(-2)
      .join("/")
      .replace(/\.[^/.]+$/, "");
    const { deleteFromCloudinary } = await import("../config/cloudinary.js");
    await deleteFromCloudinary(oldPublicId, "image").catch(() => {});
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { avatar: uploaded.url },
    { new: true }
  ).select("-password -refreshToken");

  await deleteCache(CACHE_KEYS.user(req.user._id.toString()));

  return res
    .status(200)
    .json(new ApiResponse(200, { user, avatarUrl: uploaded.url }, "Avatar uploaded successfully"));
});

/**
 * GET /api/v1/users/search?q=rahul
 * Search users by name or email (for inviting, assigning tasks etc)
 */
const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q?.trim()) throw new ApiError(400, "Search query is required");
  if (q.trim().length < 2) {
    throw new ApiError(400, "Search query must be at least 2 characters");
  }

  const users = await User.find({
    _id: { $ne: req.user._id },
    isActive: true,
    $or: [
      { fullName: { $regex: q.trim(), $options: "i" } },
      { email: { $regex: q.trim(), $options: "i" } },
    ],
  })
    .select("fullName email avatar isOnline lastSeen role")
    .limit(20);

  return res
    .status(200)
    .json(new ApiResponse(200, { users }, "Users fetched successfully"));
});

/**
 * GET /api/v1/users/:userId
 * Get any user's public profile
 */
const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select(
    "fullName email avatar bio isOnline lastSeen role createdAt"
  );

  if (!user || !user.isActive) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "User fetched successfully"));
});

/**
 * PATCH /api/v1/users/preferences
 * Update notification/theme preferences
 */
const updatePreferences = asyncHandler(async (req, res) => {
  const { notifications, theme } = req.body;

  const updateFields = {};

  if (notifications !== undefined && typeof notifications === "object") {
    Object.keys(notifications).forEach((key) => {
      updateFields[`preferences.notifications.${key}`] = notifications[key];
    });
  }

  if (theme !== undefined) {
    if (!["light", "dark", "system"].includes(theme)) {
      throw new ApiError(400, "Theme must be light, dark, or system");
    }
    updateFields["preferences.theme"] = theme;
  }

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "No valid preferences to update");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    { new: true }
  ).select("-password -refreshToken");

  await deleteCache(CACHE_KEYS.user(req.user._id.toString()));

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "Preferences updated successfully"));
});

export {
  getProfile,
  updateProfile,
  uploadAvatar,
  searchUsers,
  getUserById,
  updatePreferences,
};