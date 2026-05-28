import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_admin from "../middleware/auth_admin.js";
import uploadProfile from "../utils/profile_images.js";
import {
  createTalent,
  updateTalent,
  adjustTalentPrice,
  getMarketLogs,
  uploadTalentImage,
  updateTalentFeatured,
} from "../controllers/talentController.js";

const router = express.Router();

// All admin endpoints require admin auth
router.post("/talents", auth_key_header, auth_admin, createTalent);
router.put("/talents/:id", auth_key_header, auth_admin, updateTalent);
router.post("/talents/:id/adjust-price", auth_key_header, auth_admin, adjustTalentPrice);
router.put(
  "/talents/:id/image",
  auth_key_header,
  auth_admin,
  uploadProfile.single("image"),
  uploadTalentImage
);
router.put(
  "/talents/:id/featured",
  auth_key_header,
  auth_admin,
  updateTalentFeatured
);
router.get("/market/logs", auth_key_header, auth_admin, getMarketLogs);

export default router;
