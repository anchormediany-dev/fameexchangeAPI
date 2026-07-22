import mongoose from "mongoose";
import Stripe from "stripe";
import Talent from "../models/talentModel.js";
import FuturesPledge from "../models/futuresPledgeModel.js";
import Position from "../models/positionModel.js";
import Trade from "../models/tradeModel.js";
import Wallet from "../models/walletModel.js";
import Notification from "../models/notificationModel.js";
import { calcBidAsk } from "./tradingService.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { computeShareAllocation } from "./shareAllocationService.js";
import { recordRevenueEvent } from "./revenueTrackerService.js";
import { calculateListingFee } from "../config/feeConfig.js";
import {
  PLEDGE_BONUS_RATE,
  PLEDGE_DEADLINE_DAYS,
  MIN_PLEDGE_AMOUNT,
  MAX_PLEDGE_AMOUNT,
} from "../config/futuresConfig.js";
import { toMinorUnits } from "../utils/money.js";

// Lazy singleton — constructed on first use, not at module-load time. Module
// top-level code runs during ESM import resolution, which can happen BEFORE
// dotenv.config() has populated process.env (see the same issue called out
// in config/socialAuthConfig.js). Reading the key at call time avoids that
// import-order race entirely.
let _stripe = null;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);
const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

/**
 * POST /api/futures/:talentId/pledge-intent — creates the Stripe PaymentIntent.
 * Money is captured immediately (per product decision: pledges behave like a
 * real crowdfunding donation, not an authorization hold), so the standard
 * automatic_payment_methods flow used for wallet deposits applies unchanged.
 */
export async function createPledgeIntent(userId, talentId, amount, currency = "usd") {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error("Amount must be positive");
  if (amt < MIN_PLEDGE_AMOUNT) throw new Error(`Minimum pledge is $${MIN_PLEDGE_AMOUNT}`);
  if (amt > MAX_PLEDGE_AMOUNT) throw new Error(`Maximum single pledge is $${MAX_PLEDGE_AMOUNT}`);

  const talent = await Talent.findById(talentId);
  if (!talent) throw new Error("Talent not found");
  if (talent.tier !== "futures") throw new Error("This talent is not in the Futures tier (already tradeable, or never was)");
  if (talent.futures_closed) throw new Error("This futures campaign has closed");

  const amountInMinor = toMinorUnits(amt, currency);

  const pi = await stripe().paymentIntents.create({
    amount: amountInMinor,
    currency: String(currency).toLowerCase(),
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: {
      type: "futures_pledge",
      userId: String(userId),
      talentId: String(talentId),
      amount: String(amt),
    },
  });

  return {
    paymentIntentId: pi.id,
    clientSecret: pi.client_secret,
    status: pi.status,
    amount: amt,
    amountInMinor,
    currency: String(currency).toLowerCase(),
    bonus_rate: PLEDGE_BONUS_RATE,
  };
}

/**
 * POST /api/futures/pledge-confirm — verifies the PaymentIntent with Stripe,
 * then idempotently records the pledge. Mirrors wallet deposit-confirm.
 */
export async function confirmPledge(userId, paymentIntentId) {
  if (!paymentIntentId) throw new Error("paymentIntentId is required");

  const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  if (!pi) throw new Error("PaymentIntent not found");
  if (String(pi.metadata?.userId || "") !== String(userId)) {
    throw new Error("PaymentIntent does not belong to this user");
  }
  if (pi.metadata?.type !== "futures_pledge") {
    throw new Error("PaymentIntent is not a futures pledge");
  }
  if (pi.status !== "succeeded") {
    throw new Error(`PaymentIntent not yet succeeded (status: ${pi.status})`);
  }

  const existing = await FuturesPledge.findOne({ stripe_payment_intent_id: pi.id });
  if (existing) {
    return { already_recorded: true, pledge: existing };
  }

  const talentId = pi.metadata.talentId;
  const talent = await Talent.findById(talentId);
  if (!talent) throw new Error("Talent not found");

  const amountInMinor = Number(pi.amount_received || pi.amount || 0);
  const amount = +(amountInMinor / 100).toFixed(2);
  if (amount <= 0) throw new Error("Invalid PaymentIntent amount");

  // The talent's campaign can graduate or expire between the fan starting
  // payment (createPledgeIntent) and Stripe confirming it. Money is already
  // captured by this point, so it has to land somewhere sensible instead of
  // becoming a "pending" pledge nothing will ever revisit.
  if (talent.tier === "futures" && talent.futures_closed) {
    // Campaign already expired/refunded (see refundExpiredFuturesCampaigns)
    // without this talent graduating — refund this late arrival the same way
    // the rest of that cohort was refunded.
    await stripe().refunds.create({ payment_intent: pi.id });
    const pledge = await FuturesPledge.create({
      talent_id: talent._id,
      user_id: userId,
      amount: D128(amount),
      bonus_rate: PLEDGE_BONUS_RATE,
      status: "refunded",
      stripe_payment_intent_id: pi.id,
      pledged_at: new Date(),
      refunded_at: new Date(),
      refund_reason: "campaign_closed_before_confirmation",
    });
    await appendLedgerEntry("futures_pledge", pledge._id, pledge.toObject());
    await Notification.create({
      userId,
      category: "futures",
      description: `${talent.name}'s Futures campaign closed before your $${amount} pledge could be confirmed. You've been refunded in full.`,
      referenceModel: "Talent",
      referenceId: talent._id,
    });
    return { already_recorded: false, refunded: true, pledge, talent: talent.toDisplay() };
  }

  if (talent.tier === "tradeable") {
    // Talent already graduated before this pledge could be confirmed —
    // graduation only sweeps pledges that existed at that moment, so honor
    // this one immediately as a fulfilled position instead of leaving it
    // "pending" forever.
    const pledge = await FuturesPledge.create({
      talent_id: talent._id,
      user_id: userId,
      amount: D128(amount),
      bonus_rate: PLEDGE_BONUS_RATE,
      status: "pending",
      stripe_payment_intent_id: pi.id,
      pledged_at: new Date(),
    });
    const fulfillment = await fulfillSinglePledge(pledge, talent);
    return { already_recorded: false, late_fulfillment: true, pledge, fulfillment, talent: talent.toDisplay() };
  }

  const pledge = await FuturesPledge.create({
    talent_id: talent._id,
    user_id: userId,
    amount: D128(amount),
    bonus_rate: PLEDGE_BONUS_RATE,
    status: "pending",
    stripe_payment_intent_id: pi.id,
    pledged_at: new Date(),
  });

  // Atomic increment — talent.save() on the whole document would race with
  // concurrent pledges on the same talent and silently drop one's total.
  await Talent.updateOne({ _id: talent._id }, { $inc: { total_pledged: D128(amount) } });
  talent.total_pledged = D128(d(talent.total_pledged) + amount); // reflect it in this response only

  await appendLedgerEntry("futures_pledge", pledge._id, pledge.toObject());

  return { already_recorded: false, pledge, talent: talent.toDisplay() };
}

/**
 * Converts a single pending pledge into a real open Position of Branded
 * Talent Shares at `talent.current_price`, with the pledge's locked-in bonus
 * rate applied. Shared by graduateTalentToTradeable's sweep of every pledge
 * that existed at graduation time, and by confirmPledge's handling of a
 * pledge that gets confirmed just after graduation already happened.
 *
 * Deliberately bypasses tradingService.openTrade: no wallet debit happens
 * here because the money was already captured via Stripe when the pledge was
 * made. This is a fulfillment of a prior promise, not a new purchase.
 */
async function fulfillSinglePledge(pledge, talent) {
  const amount = d(pledge.amount);
  const bonusMultiplier = 1 + Number(pledge.bonus_rate);
  const graduationPrice = d(talent.current_price);
  // Whole shares only. Floor, but never below 1 — the pledger's money was
  // already captured via Stripe, so a fulfilled pledge always awards at
  // least one share rather than rounding a small pledge down to zero.
  const units = Math.max(1, Math.floor((amount * bonusMultiplier) / graduationPrice));

  let wallet = await Wallet.findOne({ userId: pledge.user_id });
  if (!wallet) {
    wallet = await Wallet.create({ userId: pledge.user_id, available_balance: D128(0) });
  }

  const position = await Position.create({
    user_id: pledge.user_id,
    talent_id: talent._id,
    side: "buy",
    entry_price: D128(graduationPrice),
    current_price_snapshot: D128(graduationPrice),
    units,
    invested_amount: D128(amount),
    status: "open",
    opened_at: new Date(),
  });

  const trade = await Trade.create({
    user_id: pledge.user_id,
    talent_id: talent._id,
    position_id: position._id,
    side: "buy",
    trade_type: "open",
    price: D128(graduationPrice),
    units,
    amount: D128(amount),
    fees: D128(0),
    pnl: null,
    wallet_balance_after: D128(d(wallet.available_balance)),
  });

  pledge.status = "fulfilled";
  pledge.fulfilled_at = new Date();
  pledge.awarded_units = D128(units);
  pledge.awarded_entry_price = D128(graduationPrice);
  pledge.position_id = position._id;
  await pledge.save();

  // Pledge-fulfillment shares come from the total_shares reserve outside the
  // liquidity pool (a one-time initial distribution to early backers, not a
  // market purchase) — only shares_in_circulation moves, the pool itself is
  // untouched here.
  talent.shares_in_circulation = (Number(talent.shares_in_circulation) || 0) + units;
  await talent.save();

  await appendLedgerEntry("trade", trade._id, trade.toObject());
  await appendLedgerEntry("futures_pledge", pledge._id, pledge.toObject());

  await Notification.create({
    userId: pledge.user_id,
    category: "futures",
    description: `${talent.name} has graduated to the live market! Your $${amount} early pledge was converted into ${units} Branded Talent Shares (including your ${Math.round(Number(pledge.bonus_rate) * 100)}% early-supporter bonus) at $${graduationPrice}/share.`,
    referenceModel: "Talent",
    referenceId: talent._id,
  });

  return { pledge_id: pledge._id, user_id: pledge.user_id, amount, units, position_id: position._id };
}

/**
 * Called the moment a futures-tier talent's FameScore crosses the tradeable
 * threshold (see famescoreService.recalculateTalentValuation). The tier flip
 * is claimed atomically (findOneAndUpdate filtered on tier:"futures") so that
 * two overlapping callers — the nightly cron and an admin "run now" click,
 * say — can't both pass the pre-check and double-fulfill the same pledges.
 * Only the caller that wins the atomic claim proceeds; the other sees
 * tier no longer "futures" and bails out immediately.
 */
export async function graduateTalentToTradeable(talent) {
  const claimed = await Talent.findOneAndUpdate(
    { _id: talent._id, tier: "futures" },
    { $set: { tier: "tradeable", futures_closed: true, graduated_at: new Date() } }
  );
  if (!claimed) return { graduated: false, reason: "not_futures_tier" };

  // Fixed share supply, sized exactly once — the moment this talent actually
  // becomes tradeable (see services/shareAllocationService.js).
  const { totalShares, sharesInLiquidityPool, initialSharePrice } = computeShareAllocation(
    d(claimed.estimated_monetization_value)
  );
  claimed.total_shares = totalShares;
  claimed.shares_in_liquidity_pool = sharesInLiquidityPool;
  claimed.shares_available_in_pool = sharesInLiquidityPool;
  claimed.initial_share_price = D128(initialSharePrice);
  await claimed.save();

  // Listing fee — charged exactly once, right here, the moment this talent
  // actually goes tradeable (never charged for simply sitting futures-tier).
  const listingFee = calculateListingFee(d(claimed.estimated_monetization_value));
  await recordRevenueEvent({
    event_type: "listing_fee",
    amount: listingFee,
    talent_id: claimed._id,
    notes: "futures_graduation",
  });

  const pendingPledges = await FuturesPledge.find({ talent_id: claimed._id, status: "pending" });
  const { bid } = calcBidAsk(claimed.current_price, claimed.spread);

  const fulfillments = [];
  for (const pledge of pendingPledges) {
    fulfillments.push(await fulfillSinglePledge(pledge, claimed));
  }

  return {
    graduated: true,
    fulfillments,
    bid_at_graduation: bid,
    share_allocation: { totalShares, sharesInLiquidityPool, initialSharePrice },
  };
}

/**
 * Daily job: closes out futures campaigns that have sat past the pledge
 * deadline without graduating, refunding every pending pledge via Stripe.
 */
export async function refundExpiredFuturesCampaigns() {
  const cutoff = new Date(Date.now() - PLEDGE_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

  const expired = await Talent.find({
    tier: "futures",
    futures_closed: false,
    futures_started_at: { $lte: cutoff },
  });

  const results = [];
  for (const talent of expired) {
    const pendingPledges = await FuturesPledge.find({ talent_id: talent._id, status: "pending" });

    for (const pledge of pendingPledges) {
      try {
        if (pledge.stripe_payment_intent_id) {
          await stripe().refunds.create({ payment_intent: pledge.stripe_payment_intent_id });
        }
        pledge.status = "refunded";
        pledge.refunded_at = new Date();
        pledge.refund_reason = "deadline_expired";
        await pledge.save();

        await appendLedgerEntry("futures_pledge", pledge._id, pledge.toObject());

        await Notification.create({
          userId: pledge.user_id,
          category: "futures",
          description: `${talent.name} did not reach the tradeable threshold within ${PLEDGE_DEADLINE_DAYS} days. Your $${d(pledge.amount)} pledge has been refunded.`,
          referenceModel: "Talent",
          referenceId: talent._id,
        });

        results.push({ talent_id: talent._id, pledge_id: pledge._id, success: true });
      } catch (err) {
        results.push({ talent_id: talent._id, pledge_id: pledge._id, success: false, error: err.message });
      }
    }

    talent.futures_closed = true;
    await talent.save();
  }

  return { campaigns_closed: expired.length, results };
}
