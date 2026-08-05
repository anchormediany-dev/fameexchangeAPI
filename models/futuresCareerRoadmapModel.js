import mongoose from "mongoose";

// Migrated from Base44's CareerRoadmap entity.
const futuresCareerRoadmapSchema = new mongoose.Schema(
  {
    talentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    current_position: { type: String, default: "" },
    next_milestone: { type: String, default: "" },
    thirty_day_plan: { type: [String], default: [] },
    ninety_day_vision: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("FuturesCareerRoadmap", futuresCareerRoadmapSchema);
