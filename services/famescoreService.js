import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import TalentPriceHistory from "../models/talentPriceHistoryModel.js";
import SocialConnection from "../models/socialConnection.js";
import Networth from "../models/networth.js";
import {
  calcBidAsk,
  clampPrice,
  enforceMaxMovePerTrade,
  enforceDailyLimit,
} from "./tradingService.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { graduateTalentToTradeable } from "./futuresPledgeService.js";
import { MIN_FAMESCORE_TRADEABLE } from "../config/futuresConfig.js";
import {
  PLATFORM_WEIGHT,
  VERIFICATION_MULTIPLIER,
  PLATFORM_REFERENCE_FOLLOWERS,
  FAMESCORE_MAX,
  PRICE_CURVE_EXPONENT,
  REMARK_DAMPING_FACTOR,
  PRIMARY_WEIGHT,
  SECONDARY_WEIGHT,
} from "../config/famescoreConfig.js";

const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);
const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

/**
 * Gathers a talent's social signal from BOTH sources we have:
 *  - SocialConnection: OAuth-verified, platform-API-sourced follower counts.
 *  - Networth: legacy public-scrape-derived follower counts (fallback only,
 *    and only for platforms not already covered by a verified connection).
 */
async function collectSocialSignal(userId) {
  const signal = {}; // platform -> { followers, verified }

  if (userId) {
    const connections = await SocialConnection.find({
      userId,
      status: "connected",
    }).lean();

    for (const c of connections) {
      if (Number(c.followers) > 0) {
        signal[c.platform] = { followers: Number(c.followers), verified: true };
      }
    }

    const legacy = await Networth.findOne({ userId }).lean();
    if (legacy?.socialMedia) {
      for (const [platform, data] of Object.entries(legacy.socialMedia)) {
        if (signal[platform]) continue; // verified connection already covers it
        const count = Number(data?.followers ?? data?.subscribers ?? 0);
        if (count > 0) signal[platform] = { followers: count, verified: false };
      }
    }
  }

  return signal;
}

/**
 * Core proprietary scoring function.
 *
 * Each connected platform is scored 0-1 (log-scaled against that platform's
 * reference ceiling, weighted, and discounted if unverified). FameScore is
 * then the talent's STRONGEST platform score, plus a smaller bonus for
 * presence on additional platforms — deliberately NOT an average/sum across
 * every platform at once, since that would make it mathematically impossible
 * for a genuine single-platform mega-creator (e.g. 20M YouTube subscribers,
 * nothing else) to ever score highly. Fame is dominated by your biggest
 * platform; being multi-platform is a bonus on top, not a requirement.
 */
export function computeFameScoreFromSignal(signal) {
  const breakdown = {};
  const platformScores = [];

  for (const [platform, { followers, verified }] of Object.entries(signal)) {
    const weight = PLATFORM_WEIGHT[platform];
    const reference = PLATFORM_REFERENCE_FOLLOWERS[platform];
    if (!weight || !reference) continue; // unknown platform key, ignore defensively

    const verificationMultiplier = verified
      ? VERIFICATION_MULTIPLIER.oauth_verified
      : VERIFICATION_MULTIPLIER.scraped_unverified;

    const ratio = Math.log10(followers + 1) / Math.log10(reference + 1);
    const platformScore = Math.min(1, weight * verificationMultiplier * ratio);

    platformScores.push(platformScore);
    breakdown[platform] = {
      followers,
      verified,
      weight,
      verification_multiplier: verificationMultiplier,
      platform_score: +platformScore.toFixed(4),
    };
  }

  platformScores.sort((a, b) => b - a);
  const primary = platformScores[0] || 0;
  const secondary = platformScores.slice(1);
  const secondaryAvg = secondary.length
    ? secondary.reduce((sum, s) => sum + s, 0) / secondary.length
    : 0;

  const combined = primary * PRIMARY_WEIGHT + secondaryAvg * SECONDARY_WEIGHT;
  const fameScore = Math.max(0, Math.min(FAMESCORE_MAX, Math.round(combined * FAMESCORE_MAX)));

  return { fameScore, breakdown, primary: +primary.toFixed(4), secondaryAvg: +secondaryAvg.toFixed(4) };
}

/**
 * Maps a FameScore onto a price within [minPrice, maxPrice] using a
 * super-linear curve: most scores land toward the low end of the band, with
 * price escalating quickly only for top-tier scores. This is the proprietary
 * "FameCurve" — the calibration constant lives in famescoreConfig.js.
 */
export function priceFromFameScore(fameScore, minPrice, maxPrice) {
  const ratio = Math.max(0, Math.min(1, fameScore / FAMESCORE_MAX));
  const curved = Math.pow(ratio, PRICE_CURVE_EXPONENT);
  return +(minPrice + (maxPrice - minPrice) * curved).toFixed(4);
}

/**
 * Computes a talent's current FameScore + suggested price WITHOUT writing
 * anything — used to preview a valuation before listing a talent, or to
 * inspect what a re-mark would do.
 */
export async function previewValuation(userId, minPrice = 1.0, maxPrice = 100000) {
  const signal = await collectSocialSignal(userId);
  const { fameScore, breakdown, primary, secondaryAvg } = computeFameScoreFromSignal(signal);
  const suggestedPrice = priceFromFameScore(fameScore, minPrice, maxPrice);
  return { fameScore, breakdown, primary, secondaryAvg, suggestedPrice };
}

/**
 * Re-marks a LISTED talent's valuation: recomputes FameScore from current
 * social signal, then nudges current_price a damped fraction of the way
 * toward the new fundamental-value target — passed through the trading
 * engine's existing max-move-per-trade / daily-limit / min-max clamps so a
 * follower-count change can never shock the live tradable price.
 */
export async function recalculateTalentValuation(talentId) {
  const talent = await Talent.findById(talentId);
  if (!talent) throw new Error("Talent not found");
  if (!talent.auto_price_enabled) {
    throw new Error("Auto-pricing is disabled for this talent");
  }

  const signal = await collectSocialSignal(talent.userId);
  const { fameScore, breakdown } = computeFameScoreFromSignal(signal);

  const targetPrice = priceFromFameScore(fameScore, d(talent.min_price), d(talent.max_price));
  const currentPrice = d(talent.current_price);

  const damped = currentPrice + (targetPrice - currentPrice) * REMARK_DAMPING_FACTOR;
  let newPrice = enforceMaxMovePerTrade(currentPrice, damped, talent.max_move_per_trade);
  newPrice = enforceDailyLimit(newPrice, talent.previous_close_price, talent.max_daily_move_percent);
  newPrice = +clampPrice(newPrice, talent).toFixed(4);

  const { bid, ask } = calcBidAsk(newPrice, talent.spread);

  talent.current_price = D128(newPrice);
  talent.bid_price = D128(bid);
  talent.ask_price = D128(ask);
  talent.fame_score = fameScore;
  talent.fame_score_breakdown = breakdown;
  talent.fame_score_updated_at = new Date();
  await talent.save();

  const priceHistoryEntry = await TalentPriceHistory.create({
    talent_id: talent._id,
    price: D128(newPrice),
    bid_price: D128(bid),
    ask_price: D128(ask),
    volume: D128(0),
    source_type: "valuation_update",
    recorded_at: new Date(),
  });
  await appendLedgerEntry(
    "talent_price_history",
    priceHistoryEntry._id,
    priceHistoryEntry.toObject()
  );

  let graduation = null;
  if (talent.tier === "futures" && fameScore >= MIN_FAMESCORE_TRADEABLE) {
    graduation = await graduateTalentToTradeable(talent);
  }

  return {
    talent_id: talent._id,
    fame_score: fameScore,
    breakdown,
    graduation,
    previous_price: currentPrice,
    target_price: targetPrice,
    new_price: newPrice,
    bid,
    ask,
  };
}

/**
 * Re-marks every active, auto-priced talent. Used by the scheduled cron job
 * (see services/famescoreScheduler.js) and exposed via an admin "run now"
 * endpoint for manual/testing use. Failures on individual talents are caught
 * and reported, not thrown — one bad record must never abort the whole run.
 */
export async function recalculateAllTalentValuations() {
  const talents = await Talent.find({
    status: "active",
    auto_price_enabled: true,
  })
    .select("_id")
    .lean();

  const BATCH_SIZE = 50;
  const results = [];
  for (let i = 0; i < talents.length; i += BATCH_SIZE) {
    const batch = talents.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ _id }) => {
        try {
          const result = await recalculateTalentValuation(_id);
          return { talent_id: _id, success: true, ...result };
        } catch (err) {
          return { talent_id: _id, success: false, error: err.message };
        }
      })
    );
    results.push(...batchResults);
  }

  const succeeded = results.filter((r) => r.success).length;
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  };
}
