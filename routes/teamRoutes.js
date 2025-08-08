// routes/teamRoutes.js
import { Router } from "express";
import {
  listPublicTeam,
  listTeam,
  createTeam,
  updateTeam,
  deleteTeam,
} from "../controllers/teamController.js";

import auth_admin from "../middleware/auth_admin.js";
import auth_key_header from "../middleware/auth_key_header.js";

const router = Router();

// Minimal admin gate
const requireAdmin = (req, res, next) => {
  const u = req.user;
  if (u && (u.isAdmin === true || String(u.role).toUpperCase() === "ADMIN"))
    return next();
  return res.status(403).json({ success: false, message: "Admin only" });
};

// Public
router.get("/public", listPublicTeam);

// Admin
router.get("/", auth_admin, auth_key_header, listTeam);
router.post("/", auth_admin, auth_key_header, requireAdmin, createTeam);
router.put("/:id", auth_admin, auth_key_header, requireAdmin, updateTeam);
router.delete("/:id", auth_admin, auth_key_header, requireAdmin, deleteTeam);

export default router;
