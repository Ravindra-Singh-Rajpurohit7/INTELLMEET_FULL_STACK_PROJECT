// src/middleware/rbac.middleware.js
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Role-Based Access Control Middleware
 * Usage: requireRole("admin", "super_admin")
 * Must be used AFTER verifyJWT middleware
 */
const requireRole = (...allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required before role check");
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Access denied. Required: ${allowedRoles.join(", ")}. Your role: ${req.user.role}`
      );
    }

    next();
  });
};

/**
 * Check if user is owner of a resource
 * Usage: requireOwnership((req) => req.params.userId)
 */
const requireOwnership = (getResourceOwnerId) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }

    const ownerId = await getResourceOwnerId(req);

    if (!ownerId) {
      throw new ApiError(404, "Resource not found");
    }

    const isOwner = req.user._id.equals(ownerId);
    const isSuperAdmin = req.user.role === "super_admin";

    if (!isOwner && !isSuperAdmin) {
      throw new ApiError(403, "You do not own this resource");
    }

    next();
  });
};

export { requireRole, requireOwnership };