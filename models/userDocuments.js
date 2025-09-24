// models/UserDocument.js
import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  fileUrl: { type: String, required: true },
  fileType: { type: String, required: true },

  verifiedAt: { type: Date, default: null },
});

/** ---------- Message thread (like KYC.conversation) ---------- */
const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: { type: String, enum: ["user", "admin"], required: true },
    text: { type: String, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },
    images: [fileSchema],
    files: [fileSchema],
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** ---------- Per-upload verification info ---------- */
const verificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },
    verifiedAt: { type: Date, default: null },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: { type: String, default: "" },
  },
  { _id: false }
);

const userDocumentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Top-level uploads (latest uploaded set, regardless of messages)
    uploads: {
      type: [
        new mongoose.Schema(
          {
            ...fileSchema.obj,
            verification: { type: verificationSchema, default: () => ({}) },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Message thread with attachments (KYC-style)
    messages: { type: [messageSchema], default: [] },

    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },

    isKYCVerified: { type: Boolean, default: false },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: { type: String, default: "" },
    // Messaging metadata (for inbox badges, admin queue, etc.)
    lastMessageAt: { type: Date },
    lastMessageRole: { type: String, enum: ["user", "admin"] },
    adminUnread: { type: Number, default: 0 },
    userUnread: { type: Number, default: 0 },
    needsAdminAttention: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** ---------- Helpers to maintain roll-up flags ---------- */
userDocumentSchema.methods.touchMessageMeta = function (role) {
  this.lastMessageAt = new Date();
  this.lastMessageRole = role;
  if (role === "user") {
    this.adminUnread = (this.adminUnread || 0) + 1;
    this.needsAdminAttention = true;
  }
  if (role === "admin") {
    this.userUnread = (this.userUnread || 0) + 1;
  }
};

userDocumentSchema.pre("save", function (next) {
  // auto-derive isVerified if all uploads are verified
  if (this.uploads?.length) {
    const allVerified = this.uploads.every(
      (u) => u.verification?.status === "VERIFIED"
    );
    this.isVerified = !!allVerified;
    if (allVerified && this.status !== "VERIFIED") this.status = "VERIFIED";
  } else {
    this.isVerified = false;
    if (this.status === "VERIFIED") this.status = "PENDING";
  }
  next();
});

const UserDocument = mongoose.model("UserDocument", userDocumentSchema);
export default UserDocument;
