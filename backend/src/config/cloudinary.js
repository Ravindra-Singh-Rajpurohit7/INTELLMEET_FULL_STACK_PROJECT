// src/config/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// FIX: config() ko top-level pe call mat karo
// Isse function ke andar move karo taaki dotenv load hone ke baad chale

let isConfigured = false;

const configureCloudinary = () => {
  if (isConfigured) return;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  isConfigured = true;
};

const verifyCloudinaryConfig = () => {
  configureCloudinary();

  const { cloud_name, api_key, api_secret } = cloudinary.config();

  if (!cloud_name || !api_key || !api_secret) {
    console.warn("⚠️  Cloudinary not configured. File uploads will not work.");
    return false;
  }

  console.log(`✅ Cloudinary configured: ${cloud_name}`);
  return true;
};

const uploadOnCloudinary = async (localFilePath, options = {}) => {
  configureCloudinary(); // FIX: Ensure configured before upload

  if (!localFilePath) throw new Error("File path is required for upload");

  if (!fs.existsSync(localFilePath)) {
    throw new Error(`File not found: ${localFilePath}`);
  }

  try {
    const uploadOptions = {
      resource_type: options.resourceType || "auto",
      folder: options.folder || "intellmeet",
      use_filename: true,
      unique_filename: true,
      ...options,
    };

    const response = await cloudinary.uploader.upload(
      localFilePath,
      uploadOptions
    );

    return {
      url: response.secure_url,
      publicId: response.public_id,
      format: response.format,
      size: response.bytes,
      width: response.width,
      height: response.height,
      duration: response.duration,
      resourceType: response.resource_type,
    };
  } catch (error) {
    throw new Error(`File upload failed: ${error.message}`);
  } finally {
    try {
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    } catch {}
  }
};

const uploadBufferToCloudinary = async (buffer, mimetype, folder = "intellmeet/chat") => {
  configureCloudinary(); // FIX

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        folder,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(new Error(`Upload failed: ${error.message}`));
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          size: result.bytes,
          resourceType: result.resource_type,
        });
      }
    );
    stream.end(buffer);
  });
};

const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  configureCloudinary(); // FIX

  if (!publicId) return null;
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    throw new Error(`File deletion failed: ${error.message}`);
  }
};

export {
  cloudinary,
  configureCloudinary,
  verifyCloudinaryConfig,
  uploadOnCloudinary,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
};