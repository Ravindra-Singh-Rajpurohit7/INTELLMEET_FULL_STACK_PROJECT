import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import teamRoutes from "./routes/team.routes.js";
import projectRoutes from "./routes/project.routes.js";
import chatRoutes from "./routes/chat.routes.js";


import taskRoutes from "./routes/task.routes.js";
import meetingRoutes from "./routes/meeting.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

const app = express();

// ═══════════════════════════════════════════════════════
// MIDDLEWARE SETUP
// Order matters! Security middleware should come first.
// ═══════════════════════════════════════════════════════

// ─── 1. SECURITY HEADERS ─────────────────────────────
// Helmet sets various HTTP headers for security:
// - X-Content-Type-Options: nosniff
// - X-Frame-Options: DENY
// - Content-Security-Policy
// - X-XSS-Protection
// etc.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ─── 2. CORS CONFIGURATION ───────────────────────────
// Controls which origins can access our API
app.use(
  cors({
     origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true, // Allow cookies to be sent cross-origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── 3. REQUEST LOGGING ──────────────────────────────
// Morgan logs every HTTP request
// 'dev' format: GET /api/v1/auth/login 200 45ms - 234b
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ─── 4. BODY PARSERS ─────────────────────────────────
// Parse JSON request bodies
// limit: '16kb' prevents large payload attacks
app.use(express.json({ limit: "16kb" }));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// ─── 5. COOKIE PARSER ────────────────────────────────
// Parse cookies from request headers
// Access via req.cookies.refreshToken
app.use(cookieParser());

// ─── 6. SERVE STATIC FILES ───────────────────────────
// Serves files from the public directory
app.use(express.static("public"));

// ═══════════════════════════════════════════════════════
// HEALTH CHECK
// Simple endpoint to verify server is running
// Used by load balancers and monitoring tools
// ═══════════════════════════════════════════════════════
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "IntellMeet API is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: "1.0.0",
  });
});

// ═══════════════════════════════════════════════════════
// ROUTES
// Will be added in Phase 2 onwards
// ═══════════════════════════════════════════════════════
// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/users", userRoutes);
// app.use("/api/v1/meetings", meetingRoutes);

// ─── 404 HANDLER ─────────────────────────────────────
// If no route matched, return 404
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/teams", teamRoutes);
app.use("/api/v1/projects", projectRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/v1/meetings", meetingRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────
// Must be LAST middleware (4 parameters signature)
// Catches all errors thrown by controllers/services
app.use((err, req, res, next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // ─── Mongoose Specific Errors ──────────────────────

  // Duplicate key error (e.g., email already exists)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field
      ? `${field} already exists. Please use a different ${field}.`
      : "Duplicate entry detected.";
  }

  // Invalid MongoDB ObjectId
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;
    const errors = Object.values(err.errors).map((e) => e.message);
    message = errors.join(", ");
  }

  // ─── JWT Specific Errors ───────────────────────────

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid access token. Please login again.";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Access token expired. Please refresh your token.";
  }

  // ─── Log Error in Development ─────────────────────
  if (process.env.NODE_ENV === "development") {
    console.error("\n❌ ERROR:", {
      statusCode,
      message,
      stack: err.stack,
    });
  }

  // ─── Send Response ─────────────────────────────────
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
    // Only show stack trace in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;