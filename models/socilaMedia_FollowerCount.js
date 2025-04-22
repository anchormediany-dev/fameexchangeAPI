import mongoose from "mongoose";

const followerCountSchema = new mongoose.Schema({
  platform: {
    type: String,
    required: true,
    enum: ["twitter", "facebook", "instagram", "youtube", "tiktok", "snapchat"],
  },
  username: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
    unique: true,
  },
  count: {
    type: Number,
    required: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

// Add index for faster queries
followerCountSchema.index({ platform: 1, username: 1 });

export default mongoose.model("FollowerCount", followerCountSchema);
