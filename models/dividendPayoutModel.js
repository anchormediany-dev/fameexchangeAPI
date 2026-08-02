import mongoose from "mongoose";

// One row per staker per quarterly dividend distribution
// (services/dividendScheduler.js). base_dividend = shares_staked x
// dividend_per_share; multiplied_dividend = base_dividend x multiplier —
// the actual amount credited to the user's wallet.
const dividendPayoutSchema = new mongoose.Schema(
  {
    dividend_pool_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DividendPool",
      required: true,
      index: true,
    },
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      index: true,
    },
    talent_name: { type: String, required: true },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    user_email: { type: String, required: true },

    shares_staked: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    base_dividend: { type: mongoose.Schema.Types.Decimal128, required: true },
    multiplied_dividend: { type: mongoose.Schema.Types.Decimal128, required: true },

    quarter: { type: String, required: true },
    paid_date: { type: Date, default: null },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

dividendPayoutSchema.index({ user_id: 1, quarter: -1 });

const DividendPayout = mongoose.model("DividendPayout", dividendPayoutSchema);
export default DividendPayout;
