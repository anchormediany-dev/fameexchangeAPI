import mongoose from "mongoose";

// Migrated from Base44's FanMembershipTier entity — a talent's own custom
// subscription tiers (e.g. "VIP Fan Club" $5, "Inner Circle" $15), distinct
// from the fixed platform-wide plans in futuresMembershipModel.js.
const futuresFanMembershipTierSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    benefits: { type: [String], default: [] },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    // Created lazily the first time a fan actually subscribes — Stripe
    // requires a real Price per distinct amount/tier.
    stripePriceId: { type: String, default: null },
  },
  { timestamps: true }
);

futuresFanMembershipTierSchema.index({ talentId: 1, status: 1 });

export default mongoose.model("FuturesFanMembershipTier", futuresFanMembershipTierSchema);
