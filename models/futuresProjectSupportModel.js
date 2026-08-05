import mongoose from "mongoose";

// Migrated from Base44's ProjectSupport entity — a fan's contribution to a
// FuturesProject. Stripe-settled (one-time payment, not a subscription —
// reuses the existing PaymentIntent pattern from controllers/billingController.js,
// not the new Subscriptions flow built for memberships).
const futuresProjectSupportSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "FuturesProject", required: true },
    fanId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    stripePaymentIntentId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

futuresProjectSupportSchema.index({ projectId: 1 });

export default mongoose.model("FuturesProjectSupport", futuresProjectSupportSchema);
