import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import TalentPriceHistory from "../models/talentPriceHistoryModel.js";
import SocialConnection from "../models/socialConnection.js";
import Networth from "../models/networth.js";
import {
  calcPoolBidAsk,
  clampPrice,
  enforceMaxMovePerTrade,
  enforceDailyLimit,
} from "./tradingService.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { graduateTalentToTradeable } from "./futuresPledgeService.js";
import { writeSocialSnapshots, computeGrowthRate } from "./socialSnapshotService.js";
import { computeTalentValuation } from "./valuationService.js";
import {
  platformMultiplierMidpoint,
  QUALIFICATION_THRESHOLDS,
  SINGLE_PLATFORM_QUALIFICATION,
  MONETIZATION_BENCHMARK_MONTHLY,
  GROWTH_BONUS,
  VERIFIED_BONUS,
  MULTI_PLATFORM_BONUS_3PLUS,
  MULTI_PLATFORM_BONUS_2,
  DEFAULT_ENGAGEMENT_RATE_BY_PLATFORM,
  DEFAULT_ENGAGEMENT_RATE_FALLBACK,
  RE_EVALUATION_DAYS,
  FAMESCORE_MAX,
  PRICE_CURVE_EXPONENT,
  REMARK_DAMPING_FACTOR,
} from "../config/famescoreConfig.js";
import { GRACE_PERIOD_DAYS } from "../config/feeConfig.js";

const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);
const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

function defaultEngagementRate(platform) {
  return DEFAULT_ENGAGEMENT_RATE_BY_PLATFORM[platform] ?? DEFAULT_ENGAGEMENT_RATE_FALLBACK;
}

/**
 * Gathers a talent's social signal from BOTH sources we have — OAuth-
 * verified SocialConnection (real engagement data where obtainable, today
 * only YouTube — see services/socialProviders/youtube.js) and legacy
 * scraped Networth (fallback only, follower-count-only, never "measured"
 * engagement) — in the PlatformMetrics[] shape calculateFameScore() expects.
 *
 * Pass `talentId` when this is a REAL recalculation (an existing Talent) so
 * growth rate can be computed against snapshot history (see
 * socialSnapshotService.js). Omit it for a preview/first-time call (no
 * Talent exists yet) — growthRate comes back null for every platform, which
 * calculateFameScore() treats as "no growth signal," not silently as 0%.
 */
async function collectSocialSignal(userId, talentId = null) {
  const platforms = new Map(); // platform -> PlatformMetrics

  if (userId) {
    const connections = await SocialConnection.find({
      userId,
      status: "connected",
    }).lean();

    for (const c of connections) {
      if (!(Number(c.followers) > 0)) continue;
      platforms.set(c.platform, {
        platform: c.platform,
        followers: Number(c.followers),
        engagementRate: c.engagementRate ?? defaultEngagementRate(c.platform),
        engagementRateSource: c.engagementRate != null ? "measured" : "platform_default_estimate",
        avgViewsPerPost: c.avgViewsPerPost ?? null,
        verified: true,
        growthRate: null, // filled in below if talentId is provided
      });
    }

    const legacy = await Networth.findOne({ userId }).lean();
    if (legacy?.socialMedia) {
      for (const [platform, data] of Object.entries(legacy.socialMedia)) {
        if (platforms.has(platform)) continue; // verified connection already covers it
        const count = Number(data?.followers ?? data?.subscribers ?? 0);
        if (count <= 0) continue;
        platforms.set(platform, {
          platform,
          followers: count,
          engagementRate: defaultEngagementRate(platform),
          engagementRateSource: "platform_default_estimate", // legacy scraper never measures engagement
          avgViewsPerPost: null,
          verified: false,
          growthRate: null,
        });
      }
    }
  }

  if (talentId) {
    await Promise.all(
      Array.from(platforms.values()).map(async (p) => {
        p.growthRate = await computeGrowthRate(talentId, p.platform, p.followers);
      })
    );
  }

  return Array.from(platforms.values());
}

/**
 * Core proprietary scoring function (v2). Estimates monthly monetization
 * value per platform (followers x engagement rate x per-platform revenue
 * multiplier), sums it, and normalizes against a $50K/mo benchmark into a
 * 0-100 score, plus growth/verified/multi-platform bonuses.
 *
 * Qualification is evaluated SEPARATELY from the score via two independent
 * paths — either qualifies:
 *  (a) the standard multi-platform aggregate gate (QUALIFICATION_THRESHOLDS), or
 *  (b) a single platform, on its own, clearing a meaningfully higher bar
 *      (SINGLE_PLATFORM_QUALIFICATION) — so a genuine single-platform
 *      mega-creator isn't blocked purely by minPlatforms.
 */
export function calculateFameScore(platforms) {
  const input = Array.isArray(platforms) ? platforms : [];

  // STEP 1 — per-platform monetization value.
  const perPlatform = input.map((p) => {
    const followers = Math.max(0, Number(p.followers) || 0);
    const engagementRate = Math.max(0, Number(p.engagementRate) || 0);
    const multiplier = platformMultiplierMidpoint(p.platform);
    const value = followers * engagementRate * multiplier;
    return {
      platform: p.platform,
      followers,
      engagementRate,
      engagementRateSource: p.engagementRateSource,
      value,
      verified: !!p.verified,
      growthRate: typeof p.growthRate === "number" ? p.growthRate : null,
    };
  });

  // STEP 2 — aggregate.
  const totalMonetizationValue = perPlatform.reduce((sum, p) => sum + p.value, 0);
  const totalFollowers = perPlatform.reduce((sum, p) => sum + p.followers, 0);
  const avgEngagementRate = totalFollowers > 0
    ? perPlatform.reduce((sum, p) => sum + p.engagementRate * p.followers, 0) / totalFollowers
    : 0;
  const platformCount = perPlatform.length;
  const hasGrowth = perPlatform.some((p) => (p.growthRate ?? 0) > 0);
  const hasVerified = perPlatform.some((p) => p.verified);

  const platformBreakdown = perPlatform.map((p) => ({
    platform: p.platform,
    followers: p.followers,
    engagementRate: p.engagementRate,
    growthRate: p.growthRate,
    verified: p.verified,
    value: +p.value.toFixed(2),
    contribution: totalMonetizationValue > 0 ? +((p.value / totalMonetizationValue) * 100).toFixed(1) : 0,
    ...(p.engagementRateSource ? { engagementRateSource: p.engagementRateSource } : {}),
  }));

  // STEP 3 — score (0-100).
  let score = Math.min(100, (totalMonetizationValue / MONETIZATION_BENCHMARK_MONTHLY) * 100);
  if (hasGrowth) score += GROWTH_BONUS;
  if (hasVerified) score += VERIFIED_BONUS;
  if (platformCount >= 3) score += MULTI_PLATFORM_BONUS_3PLUS;
  else if (platformCount === 2) score += MULTI_PLATFORM_BONUS_2;
  score = Math.min(100, score);
  const fameScore = +score.toFixed(1);

  // STEP 4 — qualification (two independent paths).
  const { minTotalFollowers, minEngagementRate, minPlatforms, requireGrowthTrend } = QUALIFICATION_THRESHOLDS;
  const growthOk = !requireGrowthTrend || hasGrowth;

  const misses = [];
  if (totalFollowers < minTotalFollowers) {
    misses.push(`Below ${minTotalFollowers.toLocaleString()} total followers (currently ${totalFollowers.toLocaleString()})`);
  }
  if (avgEngagementRate < minEngagementRate) {
    misses.push(`Below ${(minEngagementRate * 100).toFixed(0)}% average engagement rate (currently ${(avgEngagementRate * 100).toFixed(1)}%)`);
  }
  if (platformCount < minPlatforms) {
    misses.push(`Need ${minPlatforms}+ platforms (currently ${platformCount})`);
  }
  if (!growthOk) {
    misses.push("No positive growth trend detected");
  }
  const qualifiesViaMultiPlatform = misses.length === 0;

  const dominantPlatform = perPlatform.find(
    (p) => p.followers >= SINGLE_PLATFORM_QUALIFICATION.minFollowers && p.engagementRate >= SINGLE_PLATFORM_QUALIFICATION.minEngagementRate
  );
  const qualifiesViaSinglePlatform = !!dominantPlatform && growthOk;

  const qualified = qualifiesViaMultiPlatform || qualifiesViaSinglePlatform;

  let qualificationReason;
  if (qualifiesViaMultiPlatform) {
    qualificationReason = "Meets all qualification thresholds for tradeable asset listing";
  } else if (qualifiesViaSinglePlatform) {
    qualificationReason = `Qualifies via single-platform dominance on ${dominantPlatform.platform} (${dominantPlatform.followers.toLocaleString()} followers, ${(dominantPlatform.engagementRate * 100).toFixed(1)}% engagement)`;
  } else {
    const singleFollowers = SINGLE_PLATFORM_QUALIFICATION.minFollowers.toLocaleString();
    const singleEngagement = (SINGLE_PLATFORM_QUALIFICATION.minEngagementRate * 100).toFixed(0);
    qualificationReason = `${misses.join(". ")}. Or reach ${singleFollowers}+ followers with ${singleEngagement}%+ engagement on a single platform.`;
  }

  // STEP 5 — recommendation.
  const recommendation = qualified ? "tradeable_asset" : "famefutures_routing";

  return {
    fameScore,
    qualified,
    qualificationReason,
    platformBreakdown,
    estimatedMonetizationValue: +totalMonetizationValue.toFixed(2),
    recommendation,
    totalFollowers,
    avgEngagementRate: +avgEngagementRate.toFixed(4),
    platformCount,
    hasGrowth,
    hasVerified,
  };
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
 * The re-mark target price for recalculateTalentValuation() — pulled out as
 * a pure function so the branch is unit-testable without a DB. A tradeable
 * talent has a FIXED share supply, so its fundamental re-mark target is its
 * market-cap-consistent price (valuation / total_shares) — the FameScore
 * percentile curve has no relationship to real share economics once shares
 * actually exist. A futures-tier talent (no shares yet) still uses the
 * percentile curve as its reference/preview price ahead of listing.
 */
export function remarkTargetPrice({ tier, totalShares, valuation, fameScore, minPrice, maxPrice }) {
  if (tier === "tradeable" && totalShares) {
    return valuation / totalShares;
  }
  return priceFromFameScore(fameScore, minPrice, maxPrice);
}

/**
 * Computes a talent's current FameScore + suggested price WITHOUT writing
 * anything — used to preview a valuation before listing a talent, or to
 * inspect what a re-mark would do. No talentId yet at this point (no Talent
 * exists), so growthRate naturally comes back null for every platform.
 */
export async function previewValuation(userId, minPrice = 1.0, maxPrice = 100000) {
  const signal = await collectSocialSignal(userId);
  const scoreResult = calculateFameScore(signal);
  const suggestedPrice = priceFromFameScore(scoreResult.fameScore, minPrice, maxPrice);
  const valuationResult = computeTalentValuation(signal, scoreResult.fameScore);
  return {
    fameScore: scoreResult.fameScore,
    breakdown: scoreResult.platformBreakdown,
    qualified: scoreResult.qualified,
    qualificationReason: scoreResult.qualificationReason,
    estimatedMonetizationValue: scoreResult.estimatedMonetizationValue,
    valuation: valuationResult.valuation,
    valuationBreakdown: valuationResult,
    suggestedPrice,
  };
}

/**
 * Re-marks a LISTED talent's valuation: recomputes FameScore from current
 * social signal, then nudges current_price a damped fraction of the way
 * toward the new fundamental-value target — passed through the trading
 * engine's existing max-move-per-trade / daily-limit / min-max clamps so a
 * follower-count change can never shock the live tradable price. Writes a
 * social snapshot afterward (a REAL recalculation, unlike previewValuation)
 * so future growth-rate math has history to compare against.
 */
export async function recalculateTalentValuation(talentId) {
  const talent = await Talent.findById(talentId);
  if (!talent) throw new Error("Talent not found");
  if (!talent.auto_price_enabled) {
    throw new Error("Auto-pricing is disabled for this talent");
  }

  const signal = await collectSocialSignal(talent.userId, talent._id);
  const scoreResult = calculateFameScore(signal);
  const fameScore = scoreResult.fameScore;
  const valuationResult = computeTalentValuation(signal, fameScore);

  const targetPrice = remarkTargetPrice({
    tier: talent.tier,
    totalShares: talent.total_shares,
    valuation: valuationResult.valuation,
    fameScore,
    minPrice: d(talent.min_price),
    maxPrice: d(talent.max_price),
  });
  const currentPrice = d(talent.current_price);

  const damped = currentPrice + (targetPrice - currentPrice) * REMARK_DAMPING_FACTOR;
  let newPrice = enforceMaxMovePerTrade(currentPrice, damped, talent.max_move_per_trade);
  newPrice = enforceDailyLimit(newPrice, talent.previous_close_price, talent.max_daily_move_percent);
  newPrice = +clampPrice(newPrice, talent).toFixed(4);

  // calcPoolBidAsk gracefully falls back to the flat spread for a talent
  // with no pool yet (futures-tier) — same function every live quote uses,
  // no need to branch here.
  const { bid, ask } = calcPoolBidAsk(newPrice, talent);

  talent.current_price = D128(newPrice);
  talent.bid_price = D128(bid);
  talent.ask_price = D128(ask);
  talent.fame_score = fameScore;
  talent.fame_score_breakdown = scoreResult.platformBreakdown;
  talent.fame_score_updated_at = new Date();
  talent.qualified = scoreResult.qualified;
  talent.qualification_reason = scoreResult.qualificationReason;
  talent.estimated_monetization_value = D128(scoreResult.estimatedMonetizationValue);
  talent.valuation = D128(valuationResult.valuation);
  talent.valuation_breakdown = valuationResult;
  talent.next_re_evaluation_at = new Date(Date.now() + RE_EVALUATION_DAYS * 24 * 60 * 60 * 1000);

  // Demotion + grace period — only applies to an already-tradeable talent.
  // A futures-tier talent failing qualification just stays futures (handled
  // by the graduation check below); there's no "demotion" for something
  // that was never promoted.
  if (talent.tier === "tradeable") {
    if (!scoreResult.qualified) {
      if (!talent.qualification_grace_started_at) {
        talent.qualification_grace_started_at = new Date();
      } else {
        const graceDeadline = new Date(
          talent.qualification_grace_started_at.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
        );
        if (Date.now() >= graceDeadline.getTime() && talent.status === "active") {
          // Suspends new opens for free (getQuote/previewTrade/openTrade all
          // reject non-"active" status) — existing holders can still close.
          // tier stays "tradeable" (frozen, not routed back into a new
          // Futures pledge campaign).
          talent.status = "suspended";
        }
      }
    } else if (talent.qualification_grace_started_at) {
      // Requalified within the grace window — clear the timer, and
      // reactivate if they'd already been suspended.
      talent.qualification_grace_started_at = null;
      if (talent.status === "suspended") {
        talent.status = "active";
      }
    }
  }

  await talent.save();

  await writeSocialSnapshots(talent._id, talent.userId, signal);

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
  if (talent.tier === "futures" && scoreResult.qualified) {
    graduation = await graduateTalentToTradeable(talent);
  }

  return {
    talent_id: talent._id,
    fame_score: fameScore,
    breakdown: scoreResult.platformBreakdown,
    qualified: scoreResult.qualified,
    qualification_reason: scoreResult.qualificationReason,
    valuation: valuationResult.valuation,
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
