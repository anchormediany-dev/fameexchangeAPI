import mongoose from "mongoose";

/**
 * A fan's crowdfunding-style commitment toward a "futures" tier talent.
 * Money is captured immediately via Stripe (see futuresPledgeController.js).
 * On graduation (talent's FameScore crosses the tradeable threshold), every
 * "pending" pledge is converted into a real Position of Branded Talent
 * Shares at the graduation price, PLUS a bonus allocation (bonus_rate,
 * snapshotted at pledge time so later config changes don't retroactively
 * change anyone's already-made promise). If the talent never graduates
 * within the deadline, pending pledges are refunded instead.
 */
const futuresPledgeSchema = new mongoose.Schema(
  {
    talent_id: { type: mongoose.Schema.Types.ObjectId, ref: "Talent", required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    bonus_rate: { type: Number, required: true },

    status: {
      type: String,
      enum: ["pending", "fulfilled", "refunded"],
      default: "pending",
      index: true,
    },

    stripe_payment_intent_id: { type: String, unique: true, sparse: true },

    pledged_at: { type: Date, default: Date.now },
    fulfilled_at: { type: Date, default: null },
    refunded_at: { type: Date, default: null },
    refund_reason: { type: String, default: null },

    // Set at fulfillment time.
    awarded_units: { type: mongoose.Schema.Types.Decimal128, default: null },
    awarded_entry_price: { type: mongoose.Schema.Types.Decimal128, default: null },
    position_id: { type: mongoose.Schema.Types.ObjectId, ref: "Position", default: null },
  },
  { timestamps: true }
);

futuresPledgeSchema.index({ talent_id: 1, status: 1 });

export default mongoose.model("FuturesPledge", futuresPledgeSchema);
