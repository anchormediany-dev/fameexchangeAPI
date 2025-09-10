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
import uploadSingleFile from "../utils/multer_single_file_upload copy.js";

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
router.get("/", auth_key_header, listTeam);
router.post(
  "/",
  auth_admin,
  auth_key_header,
  requireAdmin,
  uploadSingleFile.single("imageUrl"),
  createTeam
);
router.put(
  "/:id",
  auth_admin,
  auth_key_header,
  requireAdmin,
  uploadSingleFile.single("imageUrl"),
  updateTeam
);
router.delete("/:id", auth_admin, auth_key_header, requireAdmin, deleteTeam);

export default router;
