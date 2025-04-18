import express from "express";
const router = express.Router();
import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";

import upload from "../utils/multer_multiple_file_upload.js";
import {
  signup,
  login,
  verifyOTP,
  //   resetPassword,
  resendOTP,
  forgotPassword,
} from "../controllers/auth.js";

// Signup User
router.post("/signup", auth_key_header, signup);

// Login User
router.post("/signin", auth_key_header, login);

// RE Send OTP
router.post("/resend-otp", auth_key_header, resendOTP);

// Verify OTP
router.post("/verify-otp", auth_key_header, verifyOTP);

//forget password send otp

router.post("/forget-password", auth_key_header, forgotPassword);

// Reset Password
// router.post("/reset-password", auth_key_header, resetPassword);

export default router;
