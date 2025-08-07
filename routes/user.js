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

// Get all users
router.get("/getusers", auth_key_header, auth_token, getAllUsers);

// Get specific user by ID
router.get("/get/:id", auth_key_header, auth_token, getUserById);

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
