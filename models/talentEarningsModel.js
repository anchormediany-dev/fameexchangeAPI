import mongoose from "mongoose";

// Running earnings ledger for a talent, one document per talent. Real-time
// fields (trading_royalty_accrued) get incremented immediately as trades
// happen (services/talentEarningsService.js); the monthly/quarterly cron
// jobs (services/royaltyPayoutScheduler.js, services/dividendScheduler.js)
// zero the accrued buckets and stamp the last_*_payout dates when they pay
// out. dividend_accrued stays 0 in practice — dividends are computed and
// paid atomically once per quarter (services/dividendScheduler.js), there's
// no continuous accrual state to hold between payouts. Kept for parity with
// the field's counterpart (trading_royalty_accrued), not because it's used.
const talentEarningsSchema = new mongoose.Schema(
  {
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      unique: true,
    },
    talent_name: { type: String, required: true },

    trading_royalty_accrued: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    trading_royalty_lifetime: { type: mongoose.Schema.Types.Decimal128, default: 0 },

    dividend_accrued: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    dividend_lifetime: { type: mongoose.Schema.Types.Decimal128, default: 0 },

    // Notional listing valuation (initial_share_price x total_shares) at the
    // moment vesting was initialized — not literal cash captured, since
    // nothing is sold for cash at listing except pool shares over time.
    initial_offering_proceeds: { type: mongoose.Schema.Types.Decimal128, default: 0 },

    last_royalty_payout: { type: Date, default: null },
    last_dividend_payout: { type: Date, default: null },
    next_vesting_unlock: { type: Date, default: null },
    vesting_unlocks_remaining: { type: Number, default: 5 },

    total_lifetime_earnings: { type: mongoose.Schema.Types.Decimal128, default: 0 },
  },
  { timestamps: true }
);

const TalentEarnings = mongoose.model("TalentEarnings", talentEarningsSchema);
export default TalentEarnings;
