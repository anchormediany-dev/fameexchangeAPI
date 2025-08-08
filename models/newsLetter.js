// models/Newsletter.js
import mongoose from "mongoose";

const newsletterSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
      // we keep the unique index, but we STILL check manually to return nice errors
      unique: true,
    },
    name: { type: String, trim: true },
    source: { type: String, trim: true }, // e.g. "footer-form", "popup", etc.
    status: {
      type: String,
      enum: ["subscribed", "unsubscribed"],
      default: "subscribed",
    },
    unsubscribeToken: { type: String, index: true },
  },
  { timestamps: true }
);

// Helpful compound index if you ever want to allow multiple states per email in future
// newsletterSchema.index({ email: 1 }, { unique: true });

export default mongoose.model("Newsletter", newsletterSchema);
