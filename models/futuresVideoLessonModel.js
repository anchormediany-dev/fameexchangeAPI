import mongoose from "mongoose";

// Migrated from Base44's VideoLesson entity — platform-provided (not
// talent-uploaded) expert lessons, tier-gated.
const futuresVideoLessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    expert_name: { type: String, required: true },
    expert_title: { type: String, default: "" },
    video_url: { type: String, required: true },
    thumbnail_url: { type: String, default: "" },
    advisor_key: { type: String, default: null },
    min_tier: { type: String, enum: ["starter", "pro", "elite"], default: "starter" },
    duration_minutes: { type: Number, default: 0 },
    status: { type: String, enum: ["published", "draft"], default: "draft" },
  },
  { timestamps: true }
);

export default mongoose.model("FuturesVideoLesson", futuresVideoLessonSchema);
