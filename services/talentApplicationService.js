import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import TalentPriceHistory from "../models/talentPriceHistoryModel.js";
import Notification from "../models/notificationModel.js";
import { previewValuation } from "./famescoreService.js";
import { calcBidAsk, calcPoolBidAsk } from "./tradingService.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { computeShareAllocation } from "./shareAllocationService.js";
import { initializeVestingAndEarnings } from "./vestingService.js";
import { recordRevenueEvent } from "./revenueTrackerService.js";
import { calculateListingFee } from "../config/feeConfig.js";
import { isKycVerified } from "../config/kycConfig.js";
import { RE_EVALUATION_DAYS } from "../config/famescoreConfig.js";
import { FRONTEND_PUBLIC_URL } from "../config/socialAuthConfig.js";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40) || "talent";
}

function symbolize(input) {
  const letters = String(input).toUpperCase().replace(/[^A-Z]/g, "");
  return (letters.slice(0, 5) || "TLNT");
}

async function uniqueSlug(base) {
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Talent.exists({ slug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function uniqueSymbol(base) {
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Talent.exists({ symbol: candidate })) {
    candidate = `${base.slice(0, 4)}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Self-serve "Apply to be a Talent" flow — the user-facing counterpart to the
 * admin createTalent endpoint. Runs the same FameScore engine, but instead of
 * an admin choosing the tier, the user gets routed automatically: qualifying
 * straight to the live tradeable market, or recognized as a "Future" with a
 * congratulations message and a link out to the Futures section.
 *
 * Idempotent: a user can only apply once. Calling this again just returns
 * their existing application/result.
 */
export async function applyToBeTalent(user) {
  const existing = await Talent.findOne({ userId: user._id });
  if (existing) {
    return buildResult(existing, user, { alreadyApplied: true });
  }

  const minPrice = 1.0;
  const maxPrice = 100000;
  const preview = await previewValuation(user._id, minPrice, maxPrice);

  const baseSlug = slugify(user.name || user.email || "talent");
  const slug = await uniqueSlug(baseSlug);
  const baseSymbol = symbolize(user.name || "TLNT");
  const symbol = await uniqueSymbol(baseSymbol);

  // Qualifying via FameScore isn't enough on its own — the talent also needs
  // to have passed KYC. Don't block application entirely, though: a
  // qualifying-but-unverified user still lands in "futures" (same as someone
  // genuinely below threshold) so they can still participate in pledges,
  // just flagged distinctly so the frontend can point them at KYC instead of
  // the generic "you're not there yet" copy.
  const kycVerified = isKycVerified(user);
  const tier = preview.qualified && kycVerified ? "tradeable" : "futures";
  const qualifiedPendingKyc = preview.qualified && !kycVerified;

  // A futures-tier talent gets its share supply sized later, at graduation
  // (see futuresPledgeService.graduateTalentToTradeable) — not here, since
  // "futures" isn't tradeable yet and valuation will likely be different
  // (hopefully higher) by the time they actually qualify.
  const shareAllocation = tier === "tradeable"
    ? computeShareAllocation(preview.valuation)
    : null;

  // Tradeable: the actual trading price is anchored to the discrete-share
  // model's initial_share_price (valuation / share count), quoted via the
  // same pool-based bid/ask every subsequent trade uses — NOT the FameScore
  // percentile curve's suggestedPrice, which has no relationship to real
  // share economics. Futures (no shares yet): suggestedPrice is still the
  // right reference/preview price to show.
  const anchorPrice = shareAllocation ? shareAllocation.initialSharePrice : preview.suggestedPrice;
  const { bid, ask } = shareAllocation
    ? calcPoolBidAsk(anchorPrice, {
        shares_in_liquidity_pool: shareAllocation.sharesInLiquidityPool,
        shares_available_in_pool: shareAllocation.sharesInLiquidityPool,
        spread: 0.5,
      })
    : calcBidAsk(anchorPrice, 0.5);

  const talent = await Talent.create({
    userId: user._id,
    name: user.name,
    slug,
    symbol,
    current_price: D128(anchorPrice),
    bid_price: D128(bid),
    ask_price: D128(ask),
    previous_close_price: D128(anchorPrice),
    min_price: D128(minPrice),
    max_price: D128(maxPrice),
    fame_score: preview.fameScore,
    fame_score_breakdown: preview.breakdown,
    fame_score_updated_at: new Date(),
    qualified: preview.qualified,
    qualification_reason: preview.qualificationReason,
    qualified_pending_kyc: qualifiedPendingKyc,
    estimated_monetization_value: D128(preview.estimatedMonetizationValue),
    valuation: D128(preview.valuation),
    valuation_breakdown: preview.valuationBreakdown,
    next_re_evaluation_at: new Date(Date.now() + RE_EVALUATION_DAYS * 24 * 60 * 60 * 1000),
    tier,
    futures_started_at: tier === "futures" ? new Date() : null,
    ...(shareAllocation
      ? {
          total_shares: shareAllocation.totalShares,
          shares_in_liquidity_pool: shareAllocation.sharesInLiquidityPool,
          shares_available_in_pool: shareAllocation.sharesInLiquidityPool,
          initial_share_price: D128(shareAllocation.initialSharePrice),
        }
      : {}),
  });

  if (shareAllocation) {
    await initializeVestingAndEarnings(talent, shareAllocation);
  }

  const priceHistoryEntry = await TalentPriceHistory.create({
    talent_id: talent._id,
    price: D128(anchorPrice),
    bid_price: D128(bid),
    ask_price: D128(ask),
    volume: D128(0),
    source_type: "system",
    recorded_at: new Date(),
  });
  await appendLedgerEntry("talent_price_history", priceHistoryEntry._id, priceHistoryEntry.toObject());

  // Listing fee — charged exactly once, only if tradeable right away
  // (a futures-tier talent gets charged later, at graduation, if it ever
  // happens — never for simply applying).
  if (tier === "tradeable") {
    const listingFee = calculateListingFee(preview.valuation);
    await recordRevenueEvent({
      event_type: "listing_fee",
      amount: listingFee,
      talent_id: talent._id,
      notes: "immediate_qualification",
    });
  }

  return buildResult(talent, user, { alreadyApplied: false });
}

async function buildResult(talent, user, { alreadyApplied }) {
  const isTradeable = talent.tier === "tradeable";
  const pendingKyc = !isTradeable && talent.qualified_pending_kyc;

  let message;
  if (isTradeable) {
    message = `Congratulations! Your FameScore (${talent.fame_score}/100) qualifies you as a tradeable Branded Talent Share on Fame Exchange. Fans can now buy and sell shares of your value.`;
  } else if (pendingKyc) {
    message = `Congratulations! Your FameScore (${talent.fame_score}/100) qualifies you to go tradeable — you just need to complete identity verification (KYC) first. Once approved, your shares go live automatically.`;
  } else {
    message = `Congratulations! You've been recognized as a Future on Fame Exchange — your current social reach (FameScore ${talent.fame_score}/100) is on its way, and early supporters can now back you before you go fully tradeable.`;
  }

  let redirectUrl;
  if (isTradeable) {
    redirectUrl = `${FRONTEND_PUBLIC_URL}/talent-profile/${talent._id}`;
  } else if (pendingKyc) {
    redirectUrl = `${FRONTEND_PUBLIC_URL}/verify-id`;
  } else {
    // Fame Futures now lives inside this same app (unified accounts, no
    // SSO handoff needed) — see the Fame Futures rebuild plan.
    redirectUrl = `${FRONTEND_PUBLIC_URL}/futures/dashboard`;
  }

  if (!alreadyApplied) {
    await Notification.create({
      userId: talent.userId,
      category: "talent_application",
      description: message,
      referenceModel: "Talent",
      referenceId: talent._id,
      link: redirectUrl,
    });
  }

  return {
    already_applied: alreadyApplied,
    tier: talent.tier,
    fame_score: talent.fame_score,
    talent: talent.toDisplay(),
    message,
    redirect_url: redirectUrl,
  };
}
