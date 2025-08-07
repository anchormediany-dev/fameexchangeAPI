// models/Session.js
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionLength: {
      type: String,
      enum: ["15", "30", "45", "60"],
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    sessionDate: {
      type: String, // e.g. "2025-08-15"
      required: true,
    },
    sessionTime: {
      type: String, // e.g. "14:30" or "02:30 PM"
      required: true,
    },
    bufferTime: {
      type: String,
      enum: ["0", "5", "10", "15", "20", "30"],
      required: true,
    },
    timeZone: {
      type: String, // e.g. "Africa/Abidjan"
      required: true,
    },
    accessType: {
      type: String,
      enum: ["onsite", "online"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Assuming users are stored in a "User" collection
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

export default mongoose.model("Session", sessionSchema);
