// src/config/redis.js
import { createClient } from "redis";

let redisClient = null;
let isRedisConnected = false;

const connectRedis = async () => {
  try {
    const redisURL = process.env.REDIS_URL || "redis://localhost:6379";

    redisClient = createClient({
      url: redisURL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) return false;
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: 5000,
      },
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis Connected!");
      isRedisConnected = true;
    });

    redisClient.on("ready", () => {
      console.log("   🚀 Redis ready\n");
    });

    redisClient.on("disconnect", () => {
      console.log("⚠️  Redis disconnected");
      isRedisConnected = false;
    });

    redisClient.on("error", (err) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("⚠️  Redis error (non-fatal):", err.message);
      }
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.warn("⚠️  Redis connection failed:", error.message);
    redisClient = null;
    isRedisConnected = false;
    throw error;
  }
};

const getRedisClient = () => redisClient;
const isRedisReady = () => isRedisConnected && redisClient?.isReady;

const setCache = async (key, value, ttlSeconds = 3600) => {
  if (!isRedisReady()) return false;
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn("Redis setCache error:", err.message);
    return false;
  }
};

const getCache = async (key) => {
  if (!isRedisReady()) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn("Redis getCache error:", err.message);
    return null;
  }
};

const deleteCache = async (key) => {
  if (!isRedisReady()) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch (err) {
    console.warn("Redis deleteCache error:", err.message);
    return false;
  }
};

const deleteCachePattern = async (pattern) => {
  if (!isRedisReady()) return false;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) await redisClient.del(keys);
    return true;
  } catch (err) {
    console.warn("Redis deleteCachePattern error:", err.message);
    return false;
  }
};

const CACHE_KEYS = {
  user: (userId) => `user:${userId}`,
  meetingParticipants: (meetingId) => `meeting:${meetingId}:participants`,
  teamMembers: (teamId) => `team:${teamId}:members`,
  userTeams: (userId) => `user:${userId}:teams`,
  otp: (email) => `otp:${email}`,
};

const CACHE_TTL = {
  USER: 3600,
  MEETING: 7200,
  TEAM: 1800,
  OTP: 600,
  SESSION: 86400,
};

export {
  connectRedis,
  getRedisClient,
  isRedisReady,
  setCache,
  getCache,
  deleteCache,
  deleteCachePattern,
  CACHE_KEYS,
  CACHE_TTL,
};