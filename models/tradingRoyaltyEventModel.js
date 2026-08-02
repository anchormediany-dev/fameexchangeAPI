import mongoose from "mongoose";

// One row per trade's talent-royalty skim (services/tradingService.js's
// openTrade/closeTrade, via services/talentEarningsService.js). Kept as its
// own collection rather than folded into RevenueEvent — RevenueEvent
// represents money the house earns; this is money leaving the house to the
// talent, and conflating the two would silently inflate RevenueEvent's
// existing revenue-reporting totals.
const tradingRoyaltyEventSchema = new mongoose.Schema(
  {
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      index: true,
    },
    talent_name: { type: String, required: true },
    trade_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trade",
      required: true,
    },
    trade_volume: { type: mongoose.Schema.Types.Decimal128, required: true },
    royalty_rate: { type: Number, default: 0.005 },
    royalty_amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    trade_type: { type: String, enum: ["buy", "sell"], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

tradingRoyaltyEventSchema.index({ talent_id: 1, createdAt: -1 });

const TradingRoyaltyEvent = mongoose.model("TradingRoyaltyEvent", tradingRoyaltyEventSchema);
export default TradingRoyaltyEvent;
