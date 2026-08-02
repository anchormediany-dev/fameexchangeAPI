import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import TalentEarnings from "../models/talentEarningsModel.js";
import TalentRevenueSource from "../models/talentRevenueSourceModel.js";
import StakePosition from "../models/stakePositionModel.js";
import DividendPool from "../models/dividendPoolModel.js";
import DividendPayout from "../models/dividendPayoutModel.js";
import Wallet from "../models/walletModel.js";
import WalletTransaction from "../models/walletTransactionModel.js";
import Notification from "../models/notificationModel.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { previousQuarterRange } from "../utils/quarter.js";
import { DIVIDEND_POOL_RATE, DIVIDEND_MIN_POOL_THRESHOLD } from "../config/dividendConfig.js";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));
const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);

/**
 * Pure weighted-dividend math, factored out for direct unit testing
 * (tests/dividendCalc.test.js) independent of the DB-touching cron body
 * below. `stakes` is any array of {shares_staked, multiplier} — real
 * StakePosition docs or plain fixtures both work. Returns null if there's
 * nothing to distribute (no weighted shares at all).
 */
export function computeDividendDistribution(poolAmount, stakes) {
  const totalWeightedShares = stakes.reduce((sum, s) => sum + s.shares_staked * s.multiplier, 0);
  if (totalWeightedShares <= 0) return null;

  const dividendPerWeightedShare = poolAmount / totalWeightedShares;
  const totalRawStakedShares = stakes.reduce((sum, s) => sum + s.shares_staked, 0);
  // Order-preserving (plain .map(), no spread) — safe to pair index-for-index
  // with the original `stakes` array even when those are live Mongoose
  // documents, which a spread would otherwise strip down to plain objects.
  const payouts = stakes.map((s) => {
    const base_dividend = +(s.shares_staked * dividendPerWeightedShare).toFixed(2);
    const multiplied_dividend = +(base_dividend * s.multiplier).toFixed(2);
    return { base_dividend, multiplied_dividend };
  });

  return { dividendPerWeightedShare, totalWeightedShares, totalRawStakedShares, payouts };
}

/**
 * Quarterly cron body (services/dividendScheduler.js). For each talent with
 * revenue in the quarter that just ended, funds a dividend pool (40% of
 * that revenue) and splits it across every currently-locked stake, weighted
 * by shares_staked x multiplier. Skips talents with too small a pool or no
 * locked stakes (nobody to pay). Credits real Wallets, following the same
 * WalletTransaction-paired-with-balance-change convention used everywhere
 * else in this codebase.
 */
export async function runQuarterlyDividendPayout() {
  const { quarterStr, start, end } = previousQuarterRange();

  const revenueByTalent = await TalentRevenueSource.aggregate([
    { $match: { quarter: quarterStr } },
    {
      $group: {
        _id: "$talent_id",
        total: { $sum: { $toDouble: "$amount" } },
        talent_name: { $first: "$talent_name" },
      },
    },
  ]);

  let processed = 0;
  let totalDistributed = 0;

  for (const r of revenueByTalent) {
    const poolAmount = +(r.total * DIVIDEND_POOL_RATE).toFixed(2);
    if (poolAmount < DIVIDEND_MIN_POOL_THRESHOLD) continue;

    const lockedStakes = await StakePosition.find({ talent_id: r._id, status: "locked" });
    if (!lockedStakes.length) continue;

    const distribution = computeDividendDistribution(poolAmount, lockedStakes);
    if (!distribution) continue;
    const { dividendPerWeightedShare, totalRawStakedShares, payouts } = distribution;

    const pool = await DividendPool.create({
      talent_id: r._id,
      talent_name: r.talent_name,
      quarter: quarterStr,
      quarter_start: start,
      quarter_end: end,
      platform_revenue_total: D128(r.total),
      dividend_pool_amount: D128(poolAmount),
      dividend_rate: DIVIDEND_POOL_RATE,
      total_staked_shares: totalRawStakedShares,
      dividend_per_share: D128(dividendPerWeightedShare),
      total_recipients: lockedStakes.length,
      status: "calculated",
    });
    await appendLedgerEntry("dividend_pool", pool._id, pool.toObject());

    // payouts[] mirrors lockedStakes[] index-for-index (computeDividendDistribution
    // uses .map(), order-preserving) — paired by index rather than spreading the
    // Mongoose docs into plain objects, which would strip their .save() method.
    for (let i = 0; i < lockedStakes.length; i++) {
      const stake = lockedStakes[i];
      const { base_dividend: base, multiplied_dividend: multiplied } = payouts[i];
      if (multiplied <= 0) continue;

      let wallet = await Wallet.findOne({ userId: stake.user_id });
      if (!wallet) {
        wallet = await Wallet.create({ userId: stake.user_id, available_balance: D128(0), locked_balance: D128(0) });
      }
      const balanceBefore = d(wallet.available_balance);
      const balanceAfter = +(balanceBefore + multiplied).toFixed(2);
      wallet.available_balance = D128(balanceAfter);
      await wallet.save();

      const payout = await DividendPayout.create({
        dividend_pool_id: pool._id,
        talent_id: r._id,
        talent_name: r.talent_name,
        user_id: stake.user_id,
        user_email: stake.user_email,
        shares_staked: stake.shares_staked,
        multiplier: stake.multiplier,
        base_dividend: D128(base),
        multiplied_dividend: D128(multiplied),
        quarter: quarterStr,
        paid_date: new Date(),
        status: "paid",
      });

      const walletTransaction = await WalletTransaction.create({
        user_id: stake.user_id,
        type: "dividend_payout",
        amount: D128(multiplied),
        balance_before: D128(balanceBefore),
        balance_after: D128(balanceAfter),
        reference_id: payout._id,
        reference_type: "dividend_payout",
      });
      await appendLedgerEntry("wallet_transaction", walletTransaction._id, walletTransaction.toObject());
      await appendLedgerEntry("dividend_payout", payout._id, payout.toObject());

      stake.dividend_earnings = D128(multiplied);
      stake.lifetime_dividend_earnings = D128(d(stake.lifetime_dividend_earnings) + multiplied);
      await stake.save();

      await Notification.create({
        userId: stake.user_id,
        description: `You earned a $${multiplied.toFixed(2)} dividend from your ${r.talent_name} stake this quarter.`,
        category: "dividend",
        referenceModel: "DividendPayout",
        referenceId: payout._id,
      });

      totalDistributed += multiplied;
    }

    pool.status = "distributed";
    pool.distribution_date = new Date();
    await pool.save();

    await TalentEarnings.findOneAndUpdate(
      { talent_id: r._id },
      { $set: { last_dividend_payout: new Date() } }
    );

    const talent = await Talent.findById(r._id).lean();
    if (talent?.userId) {
      await Notification.create({
        userId: talent.userId,
        description: `Your ${quarterStr} dividend pool of $${poolAmount.toFixed(2)} was distributed to ${lockedStakes.length} staker(s).`,
        category: "dividend",
        referenceModel: "DividendPool",
        referenceId: pool._id,
      });
    }

    processed += 1;
  }

  return { processed, total_distributed: +totalDistributed.toFixed(2) };
}
