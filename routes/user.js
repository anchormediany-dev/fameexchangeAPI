import express from "express";
const router = express.Router();
import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";
import {
  getAllUsers,
  getUserById,
  updateUserById,
  deleteUserById,
  updateUserProfile,
  deleteUserImage,
  getTalentOverview,
  getAllTalentUsers,
  adminDashboard,
  getFanOverview,
  updateSocialProfiles,
} from "../controllers/user.js";
import auth_admin from "../middleware/auth_admin.js";
import uploadSingleFile from "../utils/multer_single_file_upload copy.js";
import upload from "../utils/multer_multiple_file_upload.js";

// User Profile
router.post(
  "/update-user-profile",
  auth_key_header,
  auth_token,
  upload.array("images"),
  updateUserProfile
);

// JSON-only social profile update (no scrape, never blocks talent)
router.patch(
  "/social-profiles",
  auth_key_header,
  auth_token,
  updateSocialProfiles
);
router.put(
  "/social-profiles",
  auth_key_header,
  auth_token,
  updateSocialProfiles
);

// Get all users
router.get("/admin-dashboard", auth_key_header, auth_admin, adminDashboard);
router.get("/getusers", auth_key_header, getAllUsers);
router.get("/get-talent", auth_key_header, getAllTalentUsers);

// Get specific user by ID
router.get("/get/:id", auth_key_header, getUserById);

// Self (talent must be logged in)
router.get("/overview", auth_key_header, auth_token, getTalentOverview);

// Admin/ops can fetch by talent id (protect with your admin middleware if needed)
router.get("/:id/overview", auth_key_header, auth_token, getTalentOverview);
router.get("/:id/fan/overview", auth_key_header, getFanOverview);

// Update a specific user
router.put("/update/:id", auth_key_header, auth_token, updateUserById);

//delete images
router.delete(
  "/profile/image/:imageId",
  auth_key_header,
  auth_token,
  deleteUserImage
);
// Soft delete a user (admin only)
router.delete("/delete/:id", auth_key_header, auth_admin, deleteUserById);
export default router;
