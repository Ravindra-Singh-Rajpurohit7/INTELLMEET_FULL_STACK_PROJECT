// server.js mein
import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { connectRedis } from "./src/config/redis.js";
import { verifyCloudinaryConfig } from "./src/config/cloudinary.js";  // FIX: named import change
import { initializeSocket } from "./src/socket/index.js";

const PORT = process.env.PORT || 8000;

const httpServer = createServer(app);
const io = initializeSocket(httpServer);
app.set("io", io);

const startServer = async () => {
  try {
    await connectDB();

    // FIX: Ab explicitly call karo, dotenv load hone ke baad
    verifyCloudinaryConfig();

    try {
      await connectRedis();
    } catch (redisError) {
      console.warn(
        "⚠️  Redis connection failed. Continuing without cache:",
        redisError.message
      );
    }

    httpServer.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║            IntellMeet Backend Server             ║
╠══════════════════════════════════════════════════╣
║  Status      : Running ✅                         ║
║  Port        : ${PORT}                            ║
║  Environment : ${process.env.NODE_ENV}            ║
║  API Base    : http://localhost:${PORT}/api/v1    ║
║  Health      : http://localhost:${PORT}/health    ║
╚══════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error("❌ Fatal: Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

function gracefulShutdown(signal) {
  console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);
  httpServer.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("❌ Forceful shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

export { httpServer, io };