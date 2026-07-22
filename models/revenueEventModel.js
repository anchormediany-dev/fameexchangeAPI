import mongoose from "mongoose";

/**
 * Every dollar the platform itself earns — as opposed to Trade.fees, which
 * records what a USER paid (same number, different aggregation axis: this
 * answers "what did the house earn," Trade answers "what did this user
 * pay"). Every row here also gets chained into the ledger (see
 * services/ledgerService.js) alongside trades/wallet transactions/etc.
 */
const revenueEventSchema = new mongoose.Schema(
  {
    event_type: {
      type: String,
      required: true,
      enum: ["listing_fee", "transaction_fee", "market_making_spread"],
      index: true,
    },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    talent_id: { type: mongoose.Schema.Types.ObjectId, ref: "Talent", required: true, index: true },
    trade_id: { type: mongoose.Schema.Types.ObjectId, ref: "Trade", default: null },
    buyer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    seller_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

revenueEventSchema.index({ event_type: 1, createdAt: -1 });

export default mongoose.model("RevenueEvent", revenueEventSchema);
