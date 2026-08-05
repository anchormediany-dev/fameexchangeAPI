import mongoose from "mongoose";

// Migrated from Base44's Membership entity — platform-wide paid tier.
// Base44 settled this through Wix Checkout webhooks (checkout_id/
// subscription_id); Phase 3 replaces that with real Stripe Subscriptions,
// so this stores Stripe's identifiers instead.
const futuresMembershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: String, enum: ["starter", "pro", "elite"], required: true },
    status: {
      type: String,
      enum: ["pending", "active", "canceled", "expired"],
      default: "pending",
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null, index: true },
    stripePriceId: { type: String, default: null },
    // A fan can gift another user's membership.
    sponsoredById: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

futuresMembershipSchema.index({ userId: 1, status: 1 });

export default mongoose.model("FuturesMembership", futuresMembershipSchema);
