// src/routes/chat.routes.js
// FIX: CommonJS → ES Modules
// FIX: protect → verifyJWT

import { Router } from "express";
import multer from "multer";
import {
  getDirectMessages,
  getConversationList,
  getMeetingMessages,
  getTeamMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  reactToMessage,
  markMessageRead,
  searchMessages,
} from "../controllers/chat.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

// Multer: memory storage (buffer upload to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed"), false);
  },
});

router.use(verifyJWT);

router.get("/direct/conversations", getConversationList);
router.get("/direct/:userId", getDirectMessages);
router.get("/meeting/:meetingId", getMeetingMessages);
router.get("/team/:teamId", getTeamMessages);
router.post("/send", upload.array("attachments", 5), sendMessage);
router.patch("/message/:messageId", editMessage);
router.delete("/message/:messageId", deleteMessage);
router.post("/message/:messageId/react", reactToMessage);
router.post("/message/:messageId/read", markMessageRead);
router.get("/search", searchMessages);

export default router;