import mongoose from "mongoose";

const talentMarketStatsSchema = new mongoose.Schema(
  {
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      unique: true,
    },
    volume_24h: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    net_buy_pressure: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    net_sell_pressure: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    high_24h: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    low_24h: { type: mongoose.Schema.Types.Decimal128, default: 0 },
  },
  { timestamps: true }
);

const TalentMarketStats = mongoose.model("TalentMarketStats", talentMarketStatsSchema);
export default TalentMarketStats;
