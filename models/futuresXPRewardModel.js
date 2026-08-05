import mongoose from "mongoose";

// Migrated from Base44's XPReward entity — catalog of things a fan can
// redeem XP for.
const futuresXPRewardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    // ticket=show tickets, merch=merchandise, famecoin=Famecoin, shares=talent shares
    category: { type: String, enum: ["ticket", "merch", "famecoin", "shares"], required: true },
    xp_cost: { type: Number, required: true, min: 0 },
    image_url: { type: String, default: "" },
    stock: { type: Number, default: -1 }, // -1 = unlimited
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("FuturesXPReward", futuresXPRewardSchema);
