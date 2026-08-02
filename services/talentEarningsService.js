import mongoose from "mongoose";
import TalentEarnings from "../models/talentEarningsModel.js";
import TradingRoyaltyEvent from "../models/tradingRoyaltyEventModel.js";
import Talent from "../models/talentModel.js";
import Wallet from "../models/walletModel.js";
import WalletTransaction from "../models/walletTransactionModel.js";
import Notification from "../models/notificationModel.js";
import { appendLedgerEntry } from "./ledgerService.js";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));
const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);

/**
 * Called from tradingService.js's openTrade/closeTrade right after the
 * platform's own transaction-fee revenue event is recorded, whenever a
 * trade also generated a nonzero talent royalty (see getTradingRoyalty()).
 * Logs a TradingRoyaltyEvent and increments the talent's real-time accrual
 * — the monthly cron (services/royaltyPayoutScheduler.js) is what actually
 * pays it out and zeroes trading_royalty_accrued.
 *
 * Upserts TalentEarnings defensively: a talent whose Talent doc predates
 * this feature (before services/vestingService.js started initializing one
 * at listing time) won't have a TalentEarnings doc yet otherwise.
 */
export async function accrueTradingRoyalty({ talentId, talentName, tradeId, tradeVolume, royaltyAmount, tradeType }) {
  const event = await TradingRoyaltyEvent.create({
    talent_id: talentId,
    talent_name: talentName,
    trade_id: tradeId,
    trade_volume: D128(tradeVolume),
    royalty_amount: D128(royaltyAmount),
    trade_type: tradeType,
  });
  await appendLedgerEntry("trading_royalty_event", event._id, event.toObject());

  await TalentEarnings.findOneAndUpdate(
    { talent_id: talentId },
    {
      $inc: {
        trading_royalty_accrued: D128(royaltyAmount),
        trading_royalty_lifetime: D128(royaltyAmount),
        total_lifetime_earnings: D128(royaltyAmount),
      },
      $setOnInsert: { talent_name: talentName },
    },
    { upsert: true }
  );

  return event;
}

/**
 * Monthly cron body (services/royaltyPayoutScheduler.js). Pays out every
 * talent's accrued trading royalty to their real Wallet, following the same
 * WalletTransaction-paired-with-balance-change convention used everywhere
 * else in this codebase (see tradingService.js's closeTrade). Same
 * find-or-create wallet fallback as controllers/walletController.js's
 * getWallet, since a talent needs a payout destination even if they've
 * never deposited/traded themselves.
 */
export async function payOutMonthlyRoyalties() {
  const due = await TalentEarnings.find({ trading_royalty_accrued: { $gt: 0 } });

  let processed = 0;
  let totalPaid = 0;

  for (const earnings of due) {
    const talent = await Talent.findById(earnings.talent_id).lean();
    if (!talent?.userId) {
      console.warn(`[RoyaltyPayout] talent ${earnings.talent_id} has no linked user — skipping payout`);
      continue;
    }

    let wallet = await Wallet.findOne({ userId: talent.userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId: talent.userId, available_balance: D128(0), locked_balance: D128(0) });
    }

    const amount = d(earnings.trading_royalty_accrued);
    if (amount <= 0) continue;

    const balanceBefore = d(wallet.available_balance);
    const balanceAfter = +(balanceBefore + amount).toFixed(2);
    wallet.available_balance = D128(balanceAfter);
    await wallet.save();

    const walletTransaction = await WalletTransaction.create({
      user_id: talent.userId,
      type: "trading_royalty",
      amount: D128(amount),
      balance_before: D128(balanceBefore),
      balance_after: D128(balanceAfter),
      reference_type: "trading_royalty_payout",
    });
    await appendLedgerEntry("wallet_transaction", walletTransaction._id, walletTransaction.toObject());

    earnings.trading_royalty_accrued = D128(0);
    earnings.last_royalty_payout = new Date();
    await earnings.save();

    await Notification.create({
      userId: talent.userId,
      description: `Your trading royalty payout of $${amount.toFixed(2)} has been credited to your wallet.`,
      category: "royalty",
      referenceModel: "TalentEarnings",
      referenceId: earnings._id,
    });

    processed += 1;
    totalPaid += amount;
  }

  return { processed, total_paid: +totalPaid.toFixed(2) };
}
