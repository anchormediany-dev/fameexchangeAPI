import mongoose from "mongoose";

// Tracks the talent-retained share tranche (50% of total_shares, carved out
// on top of the existing valuation-driven share allocation — see
// services/vestingService.js). shares_unlocked is an ENTITLEMENT counter,
// not a literal transfer into Talent.shares_available_in_pool — when a
// talent sells unlocked shares, it goes through the ordinary
// openTrade("sell", ...) short-borrow-from-pool path exactly like any other
// user's sell, untouched by this schedule.
const unlockHistoryEntrySchema = new mongoose.Schema(
  {
    unlocked_at: { type: Date, required: true },
    shares_unlocked: { type: Number, required: true },
    cumulative_unlocked: { type: Number, required: true },
    // "scheduled" (the recurring 6-month cron unlock) vs "brand_ambassador_bonus"
    // (one-time admin-triggered early unlock, services/vestingService.js's
    // grantBrandAmbassadorBonusUnlock). granted_by is only set for the latter.
    reason: { type: String, enum: ["scheduled", "brand_ambassador_bonus"], default: "scheduled" },
    granted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false }
);

const vestingScheduleSchema = new mongoose.Schema(
  {
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      unique: true,
    },
    talent_name: { type: String, required: true },

    total_retained_shares: { type: Number, required: true },
    shares_unlocked: { type: Number, default: 0 },
    shares_locked: { type: Number, required: true },

    unlock_increment: { type: Number, required: true },
    unlock_interval_months: { type: Number, default: 6 },

    listing_date: { type: Date, required: true },
    next_unlock_date: { type: Date, required: true },

    unlock_history: { type: [unlockHistoryEntrySchema], default: [] },

    status: {
      type: String,
      enum: ["active", "fully_vested", "terminated"],
      default: "active",
    },

    // Set once, the first time an admin grants this talent a brand-ambassador
    // bonus unlock (services/vestingService.js's grantBrandAmbassadorBonusUnlock).
    // Guards against granting the one-time bonus twice.
    brand_ambassador_bonus_granted_at: { type: Date, default: null },
  },
  { timestamps: true }
);

vestingScheduleSchema.index({ status: 1, next_unlock_date: 1 });

const VestingSchedule = mongoose.model("VestingSchedule", vestingScheduleSchema);
export default VestingSchedule;
