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
  resetPassword,
  signupAdmin,
  googleLogin,
  quickQualify,
} from "../controllers/auth.js";

// Signup User
router.post("/signup", auth_key_header, signup);
router.post("/admin-signup", auth_key_header, signupAdmin);

// "See If You Qualify" — public quick-qualify flow (name + email + socials),
// silently creates a real account and runs the FameScore pipeline.
router.post("/quick-qualify", auth_key_header, quickQualify);

// Login User
router.post("/signin", auth_key_header, login);
//login in with google
router.post("/google-login", auth_key_header, googleLogin);
// RE Send OTP
router.post("/resend-otp", auth_key_header, resendOTP);

// Verify OTP
router.post("/verify-otp", auth_key_header, verifyOTP);

//forget password send otp

router.post("/forget-password", auth_key_header, forgotPassword);

// Reset Password
router.post("/reset-password", auth_key_header, resetPassword);

export default router;
