import mongoose from "mongoose";
import Position from "../models/positionModel.js";
import Talent from "../models/talentModel.js";
import User from "../models/user.js";
import StakePosition from "../models/stakePositionModel.js";
import DividendPool from "../models/dividendPoolModel.js";
import Notification from "../models/notificationModel.js";
import { openTrade } from "./tradingService.js";
import { STAKE_LOCK_MULTIPLIERS } from "../config/stakingConfig.js";
import { previousQuarterRange } from "../utils/quarter.js";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

/**
 * Staking = buy fresh shares at the current price and lock that specific
 * position. This codebase has no per-user share-balance concept to
 * validate/deduct against (every "sell" in openTrade is a fresh short
 * borrowing from the pool, not a close of a prior "buy") — reusing
 * openTrade in full sidesteps that gap entirely, and correctly reuses all
 * of its existing pool-decrement, price-impact, and bookkeeping instead of
 * forking a second, driftable pricing path. shares_staked is the OUTPUT of
 * this purchase, never a pre-validated input.
 */
export async function createStakePosition(userId, talentId, dollarAmount, lockPeriodDays) {
  const multiplier = STAKE_LOCK_MULTIPLIERS[lockPeriodDays];
  if (!multiplier) {
    throw new Error("Invalid lock_period_days — must be 30, 90, 180, or 365");
  }

  const { trade, position } = await openTrade(userId, talentId, "buy", dollarAmount, null);

  const [talent, user] = await Promise.all([
    Talent.findById(trade.talent_id).lean(),
    User.findById(userId).lean(),
  ]);

  const lockStartDate = new Date();
  const lockEndDate = new Date(lockStartDate.getTime() + lockPeriodDays * 24 * 60 * 60 * 1000);

  const stake = await StakePosition.create({
    user_id: userId,
    user_email: user.email,
    talent_id: trade.talent_id,
    talent_name: talent.name,
    position_id: position._id,
    shares_staked: trade.units,
    lock_period_days: lockPeriodDays,
    lock_start_date: lockStartDate,
    lock_end_date: lockEndDate,
    multiplier,
    status: "locked",
  });

  await Position.updateOne({ _id: position._id }, { $set: { locked_by_stake_id: stake._id } });

  return { stake, trade, position };
}

/**
 * Never sells the underlying position — clears the lock and marks status.
 * Both natural expiry (services/stakeUnlockScheduler.js) and early
 * withdrawal use this same unlock-only mechanic: the user always gets back
 * exactly the number of shares they staked, no forced loss-realizing sale.
 * Early withdrawal's only consequence is forfeiting dividend_earnings and
 * exclusion from the current/future quarter's payout — achieved for free
 * since the quarterly cron only ever considers status:"locked" stakes.
 */
export async function unstakeShares(stakePositionId, userId) {
  const stake = await StakePosition.findOne({ _id: stakePositionId, user_id: userId });
  if (!stake) throw new Error("Stake not found");
  if (stake.status !== "locked") throw new Error("Stake is not locked");

  const isEarly = new Date() < stake.lock_end_date;

  await Position.updateOne({ _id: stake.position_id }, { $set: { locked_by_stake_id: null } });

  stake.status = isEarly ? "early_withdrawn" : "unlocked";
  if (isEarly) stake.dividend_earnings = D128(0);
  await stake.save();

  await Notification.create({
    userId,
    description: isEarly
      ? `Your ${stake.talent_name} stake was withdrawn early — ${stake.shares_staked} shares returned to your portfolio (any accrued dividend eligibility for this quarter was forfeited).`
      : `Your ${stake.talent_name} stake has completed its lock period — ${stake.shares_staked} shares returned to your portfolio.`,
    category: "staking",
    referenceModel: "StakePosition",
    referenceId: stake._id,
  });

  return { stake, sharesReturned: stake.shares_staked };
}

/**
 * Daily cron body (services/stakeUnlockScheduler.js) — natural-expiry path.
 * Deliberately does NOT sell the underlying position; it just clears the
 * lock, freeing the shares back into being an ordinary, user-controlled
 * tradable Position. unstakeShares() remains the only path used for early
 * withdrawal.
 */
export async function runDailyStakeUnlock() {
  const due = await StakePosition.find({ status: "locked", lock_end_date: { $lte: new Date() } });

  let unlocked = 0;
  for (const stake of due) {
    await Position.updateOne({ _id: stake.position_id }, { $set: { locked_by_stake_id: null } });
    stake.status = "unlocked";
    await stake.save();

    await Notification.create({
      userId: stake.user_id,
      description: `Your ${stake.talent_name} stake has unlocked — ${stake.shares_staked} shares are now freely tradable in your portfolio.`,
      category: "staking",
      referenceModel: "StakePosition",
      referenceId: stake._id,
    });
    unlocked += 1;
  }

  return { unlocked };
}

export async function getUserStakes(userId) {
  return StakePosition.find({ user_id: userId }).sort({ createdAt: -1 }).lean();
}

export async function getTalentStakeStats(talentId) {
  const locked = await StakePosition.find({ talent_id: talentId, status: "locked" }).lean();
  const totalStaked = locked.reduce((sum, s) => sum + s.shares_staked, 0);
  const weightedShares = locked.reduce((sum, s) => sum + s.shares_staked * s.multiplier, 0);
  const avgMultiplier = totalStaked > 0 ? weightedShares / totalStaked : 0;

  const { quarterStr } = previousQuarterRange();
  const lastPool = await DividendPool.findOne({ talent_id: talentId, quarter: quarterStr }).lean();

  return {
    total_staked_shares: totalStaked,
    total_weighted_shares: weightedShares,
    stake_count: locked.length,
    average_multiplier: +avgMultiplier.toFixed(4),
    last_quarter_dividend_pool: lastPool ? Number(lastPool.dividend_pool_amount.toString()) : null,
  };
}
