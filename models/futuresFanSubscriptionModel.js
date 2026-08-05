import mongoose from "mongoose";

// Migrated from Base44's FanSubscription entity — a fan subscribed to a
// specific talent at one of that talent's custom FuturesFanMembershipTier
// tiers. Stripe-settled (see futuresMembershipModel.js's header comment).
const futuresFanSubscriptionSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fanId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FuturesFanMembershipTier",
      required: true,
    },
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "active", "canceled", "expired"],
      default: "pending",
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

futuresFanSubscriptionSchema.index({ fanId: 1, talentId: 1 });

export default mongoose.model("FuturesFanSubscription", futuresFanSubscriptionSchema);
