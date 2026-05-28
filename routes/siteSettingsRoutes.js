// routes/siteSettingsRoutes.js
import express from "express";
import {
  getSettings,
  updateSettings,
} from "../controllers/siteSettingsController.js";
import authAdmin from "../middleware/auth_admin.js";

const router = express.Router();

router.get("/", getSettings); // public
router.put("/", authAdmin, updateSettings); // admin only

export default router;
