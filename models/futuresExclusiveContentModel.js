import mongoose from "mongoose";

// Migrated from Base44's ExclusiveContent entity — tier-gated content a
// talent posts for their subscribers.
const futuresExclusiveContentSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    type: { type: String, enum: ["video", "audio", "photo", "lesson"], required: true },
    content_url: { type: String, required: true },
    thumbnail_url: { type: String, default: "" },
    // null/empty = visible to all of this talent's subscribers regardless of tier.
    tierId: { type: mongoose.Schema.Types.ObjectId, ref: "FuturesFanMembershipTier", default: null },
    status: { type: String, enum: ["published", "draft"], default: "draft" },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

futuresExclusiveContentSchema.index({ talentId: 1, status: 1 });

export default mongoose.model("FuturesExclusiveContent", futuresExclusiveContentSchema);
