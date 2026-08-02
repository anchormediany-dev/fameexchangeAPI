import mongoose from "mongoose";

// A stake = a real Position (position_id) bought via the ordinary trading
// engine and locked for a fixed period. shares_staked is the OUTPUT of that
// purchase (services/stakingService.js's createStakePosition), never a
// pre-validated input against some existing balance — this codebase has no
// per-user share-balance concept to validate against (every "sell" is a
// fresh short borrowing from the pool, not a close of a prior "buy").
// Unstaking (early or on schedule) NEVER sells the underlying position —
// see services/stakingService.js's unstakeShares and
// services/stakeUnlockScheduler.js — it only clears
// Position.locked_by_stake_id, returning the exact shares staked. No forced
// loss-realizing sale, ever.
const stakePositionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    user_email: { type: String, required: true },
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      index: true,
    },
    talent_name: { type: String, required: true },
    position_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Position",
      required: true,
    },

    shares_staked: { type: Number, required: true },

    lock_period_days: { type: Number, enum: [30, 90, 180, 365], required: true },
    lock_start_date: { type: Date, required: true },
    lock_end_date: { type: Date, required: true },
    multiplier: { type: Number, enum: [1.0, 1.25, 1.5, 2.0], required: true },

    status: {
      type: String,
      enum: ["locked", "unlocked", "early_withdrawn"],
      default: "locked",
    },

    dividend_earnings: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    lifetime_dividend_earnings: { type: mongoose.Schema.Types.Decimal128, default: 0 },

    created_date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

stakePositionSchema.index({ user_id: 1, status: 1 });
stakePositionSchema.index({ talent_id: 1, status: 1 });
stakePositionSchema.index({ status: 1, lock_end_date: 1 });

const StakePosition = mongoose.model("StakePosition", stakePositionSchema);
export default StakePosition;
