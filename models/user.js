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

    image: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      enum: ["ADMIN", "FAN", "TRADER", "TALENT", "ATHLETE", "INFLUENCER"],
      required: true,
    },
    // profile_pic
    // uploaded_document:{}
    usertype: { type: String },
    is_active: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    datetime: { type: String },

    google_login_id: { type: String },
    is_login_google: { type: Boolean, default: false },
    is_login_facebook: { type: Boolean, default: false },
    facebook_login_id: { type: String },

    OTP_code: { type: String },
    is_verified: {
      type: Boolean,
      default: false,
    },
    is_rep_have: { type: Boolean, default: false },
    rep_type: { type: String },

    social_youtube: { type: String },
    social_twitter: { type: String },
    social_tiktok: { type: String },
    social_facebook: { type: String },
    social_insta: { type: String },
    social_snap: { type: String },

    token_brand_name: { type: String },
    token_name: { type: String },
    networth: { type: String },
    lastlogin: { type: String },
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
    return jwt.sign(
      {
        id: this._id.toString(),
        email: this.email,
      },
      process.env.JWT_SECRET_KEY,
      {
        expiresIn: "30d",
      }
    );
  } catch (error) {
    console.error("Token Error: ", error);
  }
};

// comparePassword
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// define the collection name
const User = new mongoose.model("User", userSchema);
export default User;
