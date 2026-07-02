import rateLimit from "express-rate-limit";

/**
 * RATE LIMIT CONFIGURATIONS
 *
 * Different limits for different use cases:
 * - Auth endpoints: Strict (prevent brute force)
 * - API endpoints: Moderate
 * - AI endpoints: Very strict (expensive API calls)
 */

// ─── AUTH RATE LIMIT ─────────────────────────────────
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skipSuccessfulRequests: true,
});
// ─── GENERAL API RATE LIMIT ──────────────────────────
// 100 requests per minute per IP
// Used for: general API endpoints
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many requests. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── AI RATE LIMIT ────────────────────────────────────
// 10 requests per hour per IP
// Used for: AI transcription, summarization (expensive!)
export const aiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    statusCode: 429,
    message:
      "AI request limit reached. You can make 10 AI requests per hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── REFRESH TOKEN RATE LIMIT ─────────────────────────
// 20 requests per 15 minutes
export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many token refresh attempts.",
  },
});