// Talent notional-valuation model configuration.
//
// This is deliberately separate from famescoreConfig.js's 0-100 score
// algorithm — the score answers "does this talent qualify," this answers
// "what is this talent's brand equity worth" (a one-time, enterprise-style
// valuation, analogous to a company priced at a multiple of revenue — NOT
// literal monthly ad revenue). See services/valuationService.js.

// Engagement rate is expressed relative to a baseline, not used directly —
// a platform's revenue multiplier already encodes a "typical" engagement
// level, so engagementFactor scales up/down from that baseline instead of
// double-counting engagement in the multiplier AND the raw rate.
export const ENGAGEMENT_FACTOR_BASELINE = 0.03; // 3% engagement = 1.0x
export const ENGAGEMENT_FACTOR_MIN = 0.5;
export const ENGAGEMENT_FACTOR_MAX = 3.0;

export function engagementFactorFromRate(engagementRate) {
  const raw = Number(engagementRate) / ENGAGEMENT_FACTOR_BASELINE;
  return Math.max(ENGAGEMENT_FACTOR_MIN, Math.min(ENGAGEMENT_FACTOR_MAX, raw));
}

// Growth multiplier — rewards (or penalizes) a talent's valuation based on
// follower growth trend. `rate` is a fraction (0.05 = 5% growth), or `null`
// when no growth signal exists yet (see socialSnapshotService.computeGrowthRate)
// — treated as flat/neutral, never assumed positive or negative.
export function growthMultiplierFromRate(rate) {
  if (rate == null) return 1.0;
  if (rate < -0.05) return 0.7;
  if (rate <= 0.05) return 1.0;
  if (rate <= 0.2) return 1.3;
  if (rate <= 0.5) return 1.6;
  return 2.0;
}

// Cross-platform premium — a diversified presence carries less concentration
// risk than a single platform, so it's valued at a premium.
export function crossPlatformPremiumFor(platformCount) {
  if (platformCount <= 1) return 0.8;
  if (platformCount === 2) return 1.0;
  if (platformCount === 3) return 1.15;
  if (platformCount === 4) return 1.25;
  return 1.35;
}

// Verified-status bonus — highest applicable tier wins, not stacked.
export function verifiedBonusFor(verifiedCount) {
  if (verifiedCount >= 3) return 1.2;
  if (verifiedCount >= 1) return 1.1;
  return 1.0;
}

// Valuation multiple applied to annual monetization value, keyed by the
// talent's (unchanged) 0-100 FameScore — a business call analogous to a
// revenue multiple: higher confidence in sustained earning power commands a
// higher multiple. Below the lowest qualifying tier, a talent still gets a
// meaningful (if discounted) valuation rather than zero — a 0 would erase
// the signal entirely, e.g. in the admin dashboard or a future "gap to
// qualify" display.
export const VALUATION_MULTIPLE_BELOW_QUALIFYING = 0.5;

export function valuationMultipleFromFameScore(fameScore) {
  if (fameScore >= 90) return 3.0;
  if (fameScore >= 75) return 2.5;
  if (fameScore >= 60) return 2.0;
  if (fameScore >= 50) return 1.5;
  if (fameScore >= 40) return 1.0;
  return VALUATION_MULTIPLE_BELOW_QUALIFYING;
}
