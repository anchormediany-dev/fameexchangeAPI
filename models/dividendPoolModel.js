import mongoose from "mongoose";

// One record per talent per quarter (services/dividendScheduler.js).
// dividend_per_share is actually per WEIGHTED share (shares_staked x
// multiplier summed across locked stakes), not per raw share — named to
// match the original spec, documented here to avoid confusion at read time.
const dividendPoolSchema = new mongoose.Schema(
  {
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      index: true,
    },
    talent_name: { type: String, required: true },
    quarter: { type: String, required: true, index: true }, // "2026-Q3"
    quarter_start: { type: Date, required: true },
    quarter_end: { type: Date, required: true },

    platform_revenue_total: { type: mongoose.Schema.Types.Decimal128, required: true },
    dividend_pool_amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    dividend_rate: { type: Number, default: 0.4 },

    total_staked_shares: { type: Number, required: true },
    dividend_per_share: { type: mongoose.Schema.Types.Decimal128, required: true }, // per weighted share
    total_recipients: { type: Number, required: true },

    status: {
      type: String,
      enum: ["accruing", "calculated", "distributed"],
      default: "accruing",
    },
    distribution_date: { type: Date, default: null },
  },
  { timestamps: true }
);

dividendPoolSchema.index({ talent_id: 1, quarter: 1 }, { unique: true });

const DividendPool = mongoose.model("DividendPool", dividendPoolSchema);
export default DividendPool;
