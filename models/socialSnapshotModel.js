import mongoose from "mongoose";

/**
 * A point-in-time record of one platform's follower count + engagement rate
 * for a talent, written once per platform on every REAL FameScore v2
 * recalculation (the daily cron, or an admin "recalculate" action) — never
 * from a speculative preview call, which would pollute growth-rate history
 * with what-if data that was never a real recalculation.
 *
 * This is the only way growth rate can be computed: nothing in the codebase
 * tracked follower counts over time before this model existed.
 */
const socialSnapshotSchema = new mongoose.Schema(
  {
    talent_id: { type: mongoose.Schema.Types.ObjectId, ref: "Talent", required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    platform: { type: String, required: true },
    followers: { type: Number, required: true },
    engagement_rate: { type: Number, default: null },
    engagement_rate_source: {
      type: String,
      enum: ["measured", "platform_default_estimate", null],
      default: null,
    },
    recorded_at: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

socialSnapshotSchema.index({ talent_id: 1, platform: 1, recorded_at: -1 });

export default mongoose.model("SocialSnapshot", socialSnapshotSchema);
