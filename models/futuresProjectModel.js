import mongoose from "mongoose";

// Migrated from Base44's Project entity — a talent's crowdfunding campaign.
const futuresProjectSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Denormalized for display, matches Base44's own convention.
    talent_name: { type: String, default: "" },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    image_url: { type: String, default: "" },
    audio_url: { type: String, default: "" },
    video_url: { type: String, default: "" },
    funding_goal: { type: Number, default: 0 },
    total_raised: { type: Number, default: 0 },
    min_tier: { type: String, enum: ["starter", "pro", "elite"], default: "starter" },
    status: { type: String, enum: ["active", "funded", "closed"], default: "active" },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

futuresProjectSchema.index({ talentId: 1, status: 1 });

export default mongoose.model("FuturesProject", futuresProjectSchema);
