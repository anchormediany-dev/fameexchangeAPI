import express from "express";
import {
  createSession,
  getAllSessions,
  getSessionById,
  updateSessionStatus,
  deleteSession,
  getSessionsByUserId,
  getUpcomingSessions,
} from "../controllers/sessionController.js";

import auth_token from "../middleware/auth_token.js";

const router = express.Router();

// Protected routes
router.post("/", auth_token, createSession);
router.get("/", auth_token, getAllSessions);
router.get("/user", auth_token, getSessionsByUserId);
// GET /api/sessions/upcoming
router.get("/upcoming", auth_token, getUpcomingSessions);
router.get("/:id", auth_token, getSessionById);
router.patch("/:id/status", auth_token, updateSessionStatus);
router.delete("/:id", auth_token, deleteSession);

export default router;
