// src/services/storage.service.js
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import { ApiError } from "../utils/ApiError.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FOLDERS = {
  AVATARS: "intellmeet/avatars",
  TEAM_AVATARS: "intellmeet/teams",
  RECORDINGS: "intellmeet/recordings",
  DOCUMENTS: "intellmeet/documents",
  AUDIO: "intellmeet/audio",
  ATTACHMENTS: "intellmeet/attachments",
};

const cleanupLocalFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // non-blocking
  }
};

const uploadToCloudinary = async (localFilePath, options = {}) => {
  if (!localFilePath) throw new ApiError(400, "File path is required");
  if (!fs.existsSync(localFilePath)) {
    throw new ApiError(400, `File not found: ${localFilePath}`);
  }

  try {
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: options.resourceType || "auto",
      folder: options.folder || "intellmeet/misc",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...options,
    });

    return {
      url: response.secure_url,
      publicId: response.public_id,
      format: response.format,
      size: response.bytes,
      width: response.width || null,
      height: response.height || null,
      duration: response.duration || null,
      resourceType: response.resource_type,
    };
  } finally {
    cleanupLocalFile(localFilePath);
  }
};

const uploadImage = async (localFilePath, subfolder = "general") => {
  if (!localFilePath) throw new ApiError(400, "Image file is required");

  const isAvatar =
    subfolder === "avatars" || subfolder === "teams";

  const folder = isAvatar
    ? subfolder === "teams"
      ? FOLDERS.TEAM_AVATARS
      : FOLDERS.AVATARS
    : `${FOLDERS.ATTACHMENTS}/${subfolder}`;

  const transformations = isAvatar
    ? [
        {
          width: 400,
          height: 400,
          crop: "fill",
          gravity: "face",
          quality: "auto:good",
          fetch_format: "auto",
        },
      ]
    : [
        {
          quality: "auto:good",
          fetch_format: "auto",
        },
      ];

  const result = await uploadToCloudinary(localFilePath, {
    folder,
    resourceType: "image",
    transformation: transformations,
  });

  return result;
};

const uploadDocument = async (localFilePath, subfolder = "general") => {
  if (!localFilePath) throw new ApiError(400, "Document file is required");

  const ext = path.extname(localFilePath).toLowerCase();
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

  const isImage = imageExtensions.includes(ext);

  if (isImage) {
    return uploadImage(localFilePath, subfolder);
  }

  const result = await uploadToCloudinary(localFilePath, {
    folder: `${FOLDERS.DOCUMENTS}/${subfolder}`,
    resourceType: "raw",
  });

  return result;
};

const uploadAudio = async (localFilePath, meetingId = null) => {
  if (!localFilePath) throw new ApiError(400, "Audio file is required");

  const folder = meetingId
    ? `${FOLDERS.RECORDINGS}/${meetingId}`
    : FOLDERS.AUDIO;

  const result = await uploadToCloudinary(localFilePath, {
    folder,
    resourceType: "video",
    public_id: meetingId
      ? `recording-${meetingId}-${Date.now()}`
      : `audio-${Date.now()}`,
  });

  return result;
};

const deleteFile = async (publicId, resourceType = "image") => {
  if (!publicId) return { result: "skipped" };

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error(`[StorageService] Failed to delete ${publicId}:`, error.message);
    throw new ApiError(500, `Failed to delete file: ${error.message}`);
  }
};

const deleteMultipleFiles = async (publicIds, resourceType = "image") => {
  if (!publicIds?.length) return { deleted: 0 };

  try {
    const result = await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error("[StorageService] Bulk delete failed:", error.message);
    throw new ApiError(500, `Bulk delete failed: ${error.message}`);
  }
};

const getOptimizedUrl = (publicId, transformations = {}) => {
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    secure: true,
    quality: "auto",
    fetch_format: "auto",
    ...transformations,
  });
};

export {
  uploadImage,
  uploadDocument,
  uploadAudio,
  deleteFile,
  deleteMultipleFiles,
  getOptimizedUrl,
  FOLDERS,
};