import { platformMultiplierMidpoint } from "../config/famescoreConfig.js";
import {
  engagementFactorFromRate,
  growthMultiplierFromRate,
  crossPlatformPremiumFor,
  verifiedBonusFor,
  valuationMultipleFromFameScore,
} from "../config/valuationConfig.js";

/**
 * Computes a talent's NOTIONAL brand-equity valuation — a separate
 * calculation from calculateFameScore()'s 0-100 score, not a reuse of its
 * internal totalMonetizationValue. Where the score answers "does this
 * talent qualify," this answers "what is this talent's brand worth" as a
 * one-time, enterprise-style figure (a multiple of estimated annual
 * monetization value), not literal monthly ad revenue.
 *
 * Takes the same PlatformMetrics[] shape famescoreService.collectSocialSignal()
 * produces, plus the already-computed fameScore (0-100) for the final
 * multiple lookup.
 */
export function computeTalentValuation(platforms, fameScore) {
  const input = Array.isArray(platforms) ? platforms : [];

  // Phase A — per-platform Monthly Monetization Potential (MMP), correctly
  // scaled per the platform multipliers' documented "$ per 1,000 followers"
  // units (the bug this whole model replaces multiplied against raw
  // followers instead).
  const perPlatform = input.map((p) => {
    const followers = Math.max(0, Number(p.followers) || 0);
    const engagementRate = Math.max(0, Number(p.engagementRate) || 0);
    const multiplier = platformMultiplierMidpoint(p.platform);
    const engagementFactor = engagementFactorFromRate(engagementRate);
    const monthlyValue = (followers / 1000) * multiplier * engagementFactor;
    return {
      platform: p.platform,
      followers,
      engagementRate,
      engagementFactor,
      monthlyValue,
      verified: !!p.verified,
      growthRate: typeof p.growthRate === "number" ? p.growthRate : null,
    };
  });

  const mmp = perPlatform.reduce((sum, p) => sum + p.monthlyValue, 0);

  // Phase B — annualize.
  const amv = mmp * 12;

  // Phase C — growth multiplier, from the follower-weighted average growth
  // rate across platforms with a KNOWN growth rate — platforms with no
  // history are excluded from the average entirely, never treated as 0%.
  const growthKnownPlatforms = perPlatform.filter((p) => p.growthRate != null);
  const growthKnownFollowers = growthKnownPlatforms.reduce((sum, p) => sum + p.followers, 0);
  const growthRate = growthKnownFollowers > 0
    ? growthKnownPlatforms.reduce((sum, p) => sum + p.growthRate * p.followers, 0) / growthKnownFollowers
    : null;
  const growthMultiplier = growthMultiplierFromRate(growthRate);
  const amvAdjusted = amv * growthMultiplier;

  // Phase D — cross-platform premium.
  const platformCount = perPlatform.length;
  const crossPlatformPremium = crossPlatformPremiumFor(platformCount);
  const amvWithPremium = amvAdjusted * crossPlatformPremium;

  // Phase E — verified-status bonus (highest tier wins, not stacked).
  const verifiedCount = perPlatform.filter((p) => p.verified).length;
  const verifiedBonus = verifiedBonusFor(verifiedCount);
  const amvFinal = amvWithPremium * verifiedBonus;

  // Phase F — notional valuation via FameScore-tier multiple.
  const valuationMultiple = valuationMultipleFromFameScore(fameScore);
  const valuation = amvFinal * valuationMultiple;

  return {
    mmp: +mmp.toFixed(2),
    amv: +amv.toFixed(2),
    growthRate,
    growthMultiplier,
    amvAdjusted: +amvAdjusted.toFixed(2),
    platformCount,
    crossPlatformPremium,
    verifiedCount,
    verifiedBonus,
    amvFinal: +amvFinal.toFixed(2),
    valuationMultiple,
    valuation: +valuation.toFixed(2),
    perPlatform: perPlatform.map((p) => ({
      platform: p.platform,
      followers: p.followers,
      engagementRate: p.engagementRate,
      engagementFactor: +p.engagementFactor.toFixed(3),
      monthlyValue: +p.monthlyValue.toFixed(2),
      verified: p.verified,
      growthRate: p.growthRate,
    })),
  };
}
