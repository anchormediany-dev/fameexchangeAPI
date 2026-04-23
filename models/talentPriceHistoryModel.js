import mongoose from "mongoose";

const talentPriceHistorySchema = new mongoose.Schema(
  {
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
    },
    price: { type: mongoose.Schema.Types.Decimal128, required: true },
    bid_price: { type: mongoose.Schema.Types.Decimal128, required: true },
    ask_price: { type: mongoose.Schema.Types.Decimal128, required: true },
    volume: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    source_type: {
      type: String,
      enum: ["trade", "admin_adjustment", "system"],
      default: "trade",
    },
    source_trade_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trade",
      default: null,
    },
    recorded_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

talentPriceHistorySchema.index({ talent_id: 1, recorded_at: -1 });
talentPriceHistorySchema.index({ talent_id: 1, recorded_at: 1 });

const TalentPriceHistory = mongoose.model("TalentPriceHistory", talentPriceHistorySchema);
export default TalentPriceHistory;
