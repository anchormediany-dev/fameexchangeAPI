import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Define the User schema
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    full_name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    images: [{ type: String, default: "" }],

    role: {
      type: String,
      enum: ["ADMIN", "FAN", "TRADER", "TALENT", "ATHLETE", "INFLUENCER"],
      required: true,
    },

    usertype: { type: String },
    is_active: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    datetime: { type: String },

    google_login_id: { type: String },
    is_login_google: { type: Boolean, default: false },
    is_login_facebook: { type: Boolean, default: false },
    facebook_login_id: { type: String },

    OTP_code: { type: String },
    is_verified: { type: Boolean, default: false },
    KYC_Verified: { type: Boolean, default: false },
    is_rep_have: { type: Boolean, default: false },
    rep_type: { type: String },
    // talents: [{ type: String }],
    selected_reps: {
      type: [String],
      enum: ["business_manager", "attorney", "record_label", "agent"],
      default: [],
    },
    representation: [
      {
        type: {
          type: String,
        },
        name: {
          type: String,
        },
        email: {
          type: String,
        },
        phone: {
          type: String,
        },
      },
    ],

    stage_name: { type: String },
    brand_name: { type: String },

    biography: { type: String },

    social_youtube: { type: String },
    social_twitter: { type: String },
    social_tiktok: { type: String },
    social_facebook: { type: String },
    social_insta: { type: String },
    social_snap: { type: String },

    talent: [
      {
        category: { type: String, required: true },
        subcategory: [{ type: String, required: true }],
      },
    ],

    token_brand_name: { type: String },
    token_name: { type: String },
    networth: { type: String },
    lastlogin: { type: String },

    category: { type: String },
    subcategory: { type: String },

    is_over_18: { type: Boolean, default: false },
    agreed_terms: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// secure the password with the bcrypt
userSchema.pre("save", async function (next) {
  const user = this;

  if (!user.isModified("password")) {
    return next();
  }

  try {
    const saltRound = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(user.password, saltRound);
    user.password = hashedPassword;
  } catch (error) {
    return next(error);
  }
});

// generate JSON Web Token
userSchema.methods.generateToken = async function () {
  try {
    const payload = {
      id: this._id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      is_verified: this.is_verified,
      isAdmin: this.isAdmin,
      KYC_Verified: this.KYC_Verified,
    };
    return jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: "1d" });
  } catch (error) {
    console.error("Token generation error:", error);
    return null;
  }
};

// comparePassword
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// define the collection name
const User = new mongoose.model("User", userSchema);
export default User;
