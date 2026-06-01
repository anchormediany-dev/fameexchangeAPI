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
  updateUserFeatured,
  uploadUserImage,
} from "../controllers/user.js";
import auth_admin from "../middleware/auth_admin.js";
import uploadSingleFile from "../utils/multer_single_file_upload copy.js";
import upload from "../utils/multer_multiple_file_upload.js";
import uploadProfile from "../utils/profile_images.js";

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

// Public talent profile by id — no auth required so visitors can view the
// public profile at /talent-profile/:id without signing in.
router.get("/:id/overview", auth_key_header, getTalentOverview);
router.get("/:id/fan/overview", auth_key_header, getFanOverview);

// Admin: feature/unfeature a talent user in the home Inverse section
router.put(
  "/admin/:id/featured",
  auth_key_header,
  auth_admin,
  updateUserFeatured
);
// Admin: replace a talent user's profile image
router.put(
  "/admin/:id/image",
  auth_key_header,
  auth_admin,
  uploadProfile.single("image"),
  uploadUserImage
);

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
