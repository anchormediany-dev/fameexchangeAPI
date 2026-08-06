import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const imageSchema = new mongoose.Schema(
  {
    fileUrl: { type: String, required: true },
  },
  { _id: true } // Auto-generate _id for each image
);
// Define the User schema
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    full_name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    images: [imageSchema],

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
    // Epoch-ms expiry for OTP_code (signup verification, password reset,
    // account-claim). Was previously read/written by controllers/auth.js
    // without being declared here, so Mongoose silently dropped it on every
    // save — every OTP was effectively permanent. Now it actually persists.
    otp_expiry: { type: Number, default: null },
    is_verified: { type: Boolean, default: false },
    KYC_Verified: { type: Boolean, default: false },

    // Custodial Solana wallet (services/solanaWalletService.js) — the
    // backend generates and holds this on the user's behalf, same model a
    // brokerage uses for "street name" shares, so there's no wallet-connect/
    // seed-phrase UX. Public address is safe to expose (it's how anyone,
    // including the user, independently verifies real on-chain holdings on
    // a block explorer). The private key is NEVER stored raw — only a KMS
    // envelope-encrypted ciphertext, and select:false so it's never
    // accidentally included in a normal query result.
    solanaWalletAddress: { type: String, default: null, index: true },
    solanaWalletEncryptedKey: { type: String, default: null, select: false },

    // Was previously read/written by billingController.js's ensureStripeCustomer
    // without being declared here, so Mongoose silently dropped it on every
    // save (same class of bug as otp_expiry above) — every payment created a
    // brand-new Stripe customer instead of reusing one. Now it persists.
    stripeCustomerId: { type: String, default: null, index: true },
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
        category: { type: String },
        subcategory: [{ type: String }],
      },
    ],

    token_brand_name: { type: String },
    token_name: { type: String },
    networth: { type: String },
    // Sum of follower counts across OAuth-verified social connections.
    // Computed independently of `networth` (the legacy scraper value).
    // Stays 0 until the user connects at least one social account.
    social_worth: { type: Number, default: 0 },
    lastlogin: { type: String },

    category: { type: String },
    subcategory: { type: String },

    is_over_18: { type: Boolean, default: false },
    agreed_terms: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false },
    otpCount: { type: Number, default: 0 },

    // Admin-controlled "Inverse" section featuring on the home page.
    featured_in_inverse: { type: Boolean, default: false, index: true },
    inverse_order: { type: Number, default: 0 },
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
      name: this.name,
      full_name: this.full_name,
      is_verified: this.is_verified,
      isAdmin: this.isAdmin,
      role: this.role,
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
