import User from "../models/user.js";

import sendEmail from "../utils/helper.js";
import { signupSchema } from "../validators/user.js";

const signup = async (req, res) => {
  try {
    // ✅ Validate Request
    const data = signupSchema.parse(req.body);

    // ✅ Check required terms
    if (!req.body.is_over_18 || !req.body.agreed_terms) {
      return res.status(400).json({
        success: false,
        error: "You must be over 18 and agree to the terms and conditions.",
      });
    }
    // ✅ Check if user exists
    const userExist = await User.findOne({ email: data.email });
    if (userExist) {
      return res
        .status(400)
        .json({ message: "email already exists", success: false });
    }

    // ✅ Generate OTP
    data.OTP_code = Math.floor(1000 + Math.random() * 9000).toString();

    // ✅ Attempt to send OTP email first
    const emailSent = await sendEmail(data.email, "otp", data.OTP_code);

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please try again.",
      });
    }

    // ✅ Create User
    const user = await User.create(data);

    res.status(201).json({
      success: true,
      userId: user._id.toString(),
      emailVerification: emailSent
        ? "Email Verification Code Sent"
        : "Failed to send email",
    });
  } catch (err) {
    const error = err.errors?.[0]?.message || err.message;
    res.status(400).json({ success: false, message: error });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const userExist = await User.findOne({ email });

    if (!userExist) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!userExist.is_active) {
      return res.status(400).json({ message: "Your account is Inactive" });
    }

    if (!userExist.is_verified) {
      return res.status(400).json({
        message: "Your account is not verified.",
        reason: "account_verification_issue",
      });
    }

    // const user = await bcrypt.compare(password, userExist.password);
    const isPasswordValid = await userExist.comparePassword(password);

    if (isPasswordValid) {
      res.status(200).json({
        message: "Login Successful",
        token: await userExist.generateToken(),
      });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "email and otp required" });
    }

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "user not found" });
    }

    if (user.OTP_code == otp) {
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { is_verified: true, OTP_code: "" },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(404).json({ message: "user not found" });
      }

      return res.status(200).json({
        message: "Verified",
        success: true,
      });
    } else {
      return res.status(401).json({ message: "wrong otp" });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

//resend otp code
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate 4-digit random OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Store OTP in user record
    user.otp_code = otp;
    await user.save();

    const emailSent = await sendEmail(user.email, "otp", otp.toString()); // assuming sendEmail(user, code)

    return res.status(200).json({
      message: emailSent ? "OTP sent successfully" : "Failed to send OTP email",
      success: !!emailSent, // true if sent, false if not
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000); // 6-digit OTP
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    console.log("user", user);

    user.OTP_code = otp;
    user.otp_expiry = otpExpiry;

    await sendEmail(user.email, "resetlink", otp.toString());
    await user.save();

    res.status(200).json({
      message: "OTP sent to email",
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reset Password API
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    console.log(req.body);
    // Check if all fields are provided
    if (!email || !otp || !password) {
      return res
        .status(400)
        .json({ message: "Email, OTP, and new password are required" });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Verify if the OTP matches and is not expired
    if (user.OTP_code !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otp_expiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password should be at least 6 characters long" });
    }

    // Reset the password
    user.password = password; // Remember to hash the password before saving it
    user.OTP_code = undefined; // Clear OTP data
    user.otp_expiry = undefined; // Clear OTP expiry
    user.is_verified = true; // Mark the user as verified if necessary

    // Save the user with the new password
    await user.save();

    // Return success response
    res
      .status(200)
      .json({ message: "Password reset successful", success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export { signup, login, verifyOTP, resendOTP };
