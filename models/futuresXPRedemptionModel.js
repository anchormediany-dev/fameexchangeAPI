import mongoose from "mongoose";

// Migrated from Base44's XPRedemption entity — a fan's redemption record of
// a FuturesXPReward.
const futuresXPRedemptionSchema = new mongoose.Schema(
  {
    fanId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rewardId: { type: mongoose.Schema.Types.ObjectId, ref: "FuturesXPReward", required: true },
    reward_title: { type: String, required: true },
    category: { type: String, default: "" },
    xp_cost: { type: Number, required: true },
    status: { type: String, enum: ["pending", "fulfilled", "canceled"], default: "pending" },
  },
  { timestamps: true }
);

futuresXPRedemptionSchema.index({ fanId: 1 });

export default mongoose.model("FuturesXPRedemption", futuresXPRedemptionSchema);
