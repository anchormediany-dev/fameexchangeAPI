import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import Trade from "../models/tradeModel.js";
import VestingSchedule from "../models/vestingScheduleModel.js";
import TalentEarnings from "../models/talentEarningsModel.js";
import Notification from "../models/notificationModel.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { MARKET_MAKING } from "../config/marketMakingConfig.js";
import {
  RETAINED_SHARE_FRACTION,
  VESTING_UNLOCK_COUNT,
  VESTING_UNLOCK_INTERVAL_MONTHS,
} from "../config/vestingConfig.js";

const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Layers the talent-retained/vesting tranche on top of the existing
 * valuation-driven share allocation — an ADDITIONAL step, not a new
 * issuance pipeline. Called right after each of the 3 existing call sites
 * (applyToBeTalent, graduateTalentToTradeable, createTalent) assigns
 * computeShareAllocation()'s result onto the talent. Creates one
 * VestingSchedule + one TalentEarnings record; both are idempotent no-ops
 * if already present (defensive — none of the 3 call sites can run twice
 * for the same talent today, but a retry after a partial failure shouldn't
 * duplicate records).
 */
export async function initializeVestingAndEarnings(talent, shareAllocation) {
  const existing = await VestingSchedule.findOne({ talent_id: talent._id }).lean();
  if (existing) return { vestingSchedule: existing, alreadyInitialized: true };

  const totalShares = shareAllocation.totalShares;
  const sharesRetainedVested = Math.round(totalShares * RETAINED_SHARE_FRACTION);
  const unlockIncrement = Math.round(sharesRetainedVested / VESTING_UNLOCK_COUNT);
  const listingDate = new Date();
  const nextUnlockDate = addMonths(listingDate, VESTING_UNLOCK_INTERVAL_MONTHS);

  const vestingSchedule = await VestingSchedule.create({
    talent_id: talent._id,
    talent_name: talent.name,
    total_retained_shares: sharesRetainedVested,
    shares_unlocked: 0,
    shares_locked: sharesRetainedVested,
    unlock_increment: unlockIncrement,
    unlock_interval_months: VESTING_UNLOCK_INTERVAL_MONTHS,
    listing_date: listingDate,
    next_unlock_date: nextUnlockDate,
    unlock_history: [],
    status: "active",
  });
  await appendLedgerEntry("vesting_schedule", vestingSchedule._id, vestingSchedule.toObject());

  // Notional listing valuation (initial_share_price x total_shares) — not
  // literal cash captured, since nothing is sold for cash at listing except
  // pool shares over time via ordinary trading.
  const initialOfferingProceeds = shareAllocation.initialSharePrice * totalShares;

  const talentEarnings = await TalentEarnings.create({
    talent_id: talent._id,
    talent_name: talent.name,
    trading_royalty_accrued: 0,
    trading_royalty_lifetime: 0,
    dividend_accrued: 0,
    dividend_lifetime: 0,
    initial_offering_proceeds: initialOfferingProceeds,
    last_royalty_payout: null,
    last_dividend_payout: null,
    next_vesting_unlock: nextUnlockDate,
    vesting_unlocks_remaining: VESTING_UNLOCK_COUNT,
    total_lifetime_earnings: 0,
  });
  await appendLedgerEntry("talent_earnings", talentEarnings._id, talentEarnings.toObject());

  return { vestingSchedule, talentEarnings, alreadyInitialized: false };
}

/**
 * Daily cron body (services/vestingUnlockScheduler.js). Unlocks every
 * VestingSchedule whose next_unlock_date has arrived. shares_unlocked stays
 * an ENTITLEMENT counter only — it does not move into
 * Talent.shares_available_in_pool. Selling unlocked shares later goes
 * through the ordinary openTrade("sell", ...) short-borrow-from-pool path,
 * exactly like any other user's sell, untouched by this function.
 */
export async function runDailyVestingUnlock() {
  const due = await VestingSchedule.find({
    status: "active",
    next_unlock_date: { $lte: new Date() },
  });

  let processed = 0;
  for (const schedule of due) {
    const earnings = await TalentEarnings.findOne({ talent_id: schedule.talent_id });
    if (!earnings) {
      console.warn(`[VestingUnlock] no TalentEarnings for talent ${schedule.talent_id} — skipping`);
      continue;
    }

    schedule.shares_unlocked += schedule.unlock_increment;
    schedule.shares_locked = Math.max(0, schedule.shares_locked - schedule.unlock_increment);
    schedule.unlock_history.push({
      unlocked_at: new Date(),
      shares_unlocked: schedule.unlock_increment,
      cumulative_unlocked: schedule.shares_unlocked,
    });

    earnings.vesting_unlocks_remaining = Math.max(0, earnings.vesting_unlocks_remaining - 1);
    const stillVesting = earnings.vesting_unlocks_remaining > 0;
    earnings.next_vesting_unlock = stillVesting
      ? addMonths(new Date(), schedule.unlock_interval_months)
      : null;

    schedule.status = stillVesting ? "active" : "fully_vested";
    schedule.next_unlock_date = earnings.next_vesting_unlock || schedule.next_unlock_date;

    await schedule.save();
    await earnings.save();
    await appendLedgerEntry("vesting_schedule", schedule._id, schedule.toObject());

    const talent = await Talent.findById(schedule.talent_id).lean();
    if (talent?.userId) {
      await Notification.create({
        userId: talent.userId,
        description: `${schedule.unlock_increment.toLocaleString()} of your retained shares just vested — ${schedule.shares_unlocked.toLocaleString()} total unlocked so far.`,
        category: "vesting",
        referenceModel: "VestingSchedule",
        referenceId: schedule._id,
      });
    }
    processed += 1;
  }

  return { processed };
}

/**
 * Admin-triggered, one-time bonus unlock for talents who sign on as brand
 * ambassadors — releases an extra `unlock_increment` (the same size as one
 * regular scheduled unlock, i.e. 10% of total_shares) from the ALREADY
 * talent-retained tranche early, on top of and independent from the normal
 * 5-unlock/6-month schedule. Deliberately does NOT touch
 * vesting_unlocks_remaining or next_vesting_unlock — the talent still gets
 * every one of their regular scheduled unlocks in full; this is additional,
 * not an acceleration that eats into that allocation. Not a new share
 * issuance: no dilution, nothing minted, same total_retained_shares pool.
 */
export async function grantBrandAmbassadorBonusUnlock(talentId, adminUserId) {
  const schedule = await VestingSchedule.findOne({ talent_id: talentId });
  if (!schedule) throw new Error("No vesting schedule found for this talent");
  if (schedule.brand_ambassador_bonus_granted_at) {
    throw new Error("Brand ambassador bonus unlock has already been granted to this talent");
  }
  if (schedule.status === "terminated") {
    throw new Error("Cannot grant a bonus unlock on a terminated vesting schedule");
  }

  const bonusAmount = Math.min(schedule.unlock_increment, schedule.shares_locked);
  if (bonusAmount <= 0) {
    throw new Error("This talent has no locked shares left to unlock");
  }

  schedule.shares_unlocked += bonusAmount;
  schedule.shares_locked -= bonusAmount;
  schedule.unlock_history.push({
    unlocked_at: new Date(),
    shares_unlocked: bonusAmount,
    cumulative_unlocked: schedule.shares_unlocked,
    reason: "brand_ambassador_bonus",
    granted_by: adminUserId,
  });
  schedule.brand_ambassador_bonus_granted_at = new Date();

  await schedule.save();
  await appendLedgerEntry("vesting_schedule", schedule._id, schedule.toObject());

  const talent = await Talent.findById(schedule.talent_id).lean();
  if (talent?.userId) {
    await Notification.create({
      userId: talent.userId,
      description: `You just received a brand ambassador bonus unlock of ${bonusAmount.toLocaleString()} shares — ${schedule.shares_unlocked.toLocaleString()} total unlocked so far. Your regular vesting schedule is unaffected.`,
      category: "vesting",
      referenceModel: "VestingSchedule",
      referenceId: schedule._id,
    });
  }

  return { schedule, bonusAmount };
}

/**
 * Read-only derived view matching the spec's requested "LiquidityPoolPosition"
 * shape — no new stored state. Talent.shares_in_liquidity_pool/
 * shares_available_in_pool already ARE this data; storing a second copy
 * would be a second, driftable source of truth.
 */
export async function getLiquidityPoolPositionView(talentId) {
  const talent = await Talent.findById(talentId).lean();
  if (!talent) return null;

  const poolSize = Number(talent.shares_in_liquidity_pool) || 0;
  const available = Number(talent.shares_available_in_pool) || 0;
  const utilization = poolSize > 0 ? 1 - Math.max(0, Math.min(1, available / poolSize)) : 0;
  const currentSpread =
    MARKET_MAKING.spreadPercent +
    (MARKET_MAKING.maxSpreadPercent - MARKET_MAKING.spreadPercent) * utilization;

  const [volumeAgg] = await Trade.aggregate([
    { $match: { talent_id: new mongoose.Types.ObjectId(talentId) } },
    { $group: { _id: null, total: { $sum: { $toDouble: "$amount" } } } },
  ]);

  return {
    talent_id: talent._id,
    talent_name: talent.name,
    total_pool_shares: poolSize,
    available_shares: available,
    reserved_shares: poolSize - available,
    current_spread: +currentSpread.toFixed(4),
    pool_value: +(available * d(talent.current_price)).toFixed(2),
    total_volume_traded: volumeAgg ? +volumeAgg.total.toFixed(2) : 0,
    last_rebalance: talent.updatedAt,
    status: poolSize <= 0 ? "depleted" : talent.status === "suspended" ? "frozen" : "active",
  };
}
