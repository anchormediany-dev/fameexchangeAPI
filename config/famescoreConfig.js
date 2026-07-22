// Proprietary "FameScore" valuation engine configuration.
//
// FameScore converts a talent's social presence into a single 0-100 score,
// estimated from MONTHLY MONETIZATION VALUE (followers x engagement rate x
// per-platform revenue multiplier) rather than raw follower counts alone —
// this is the v2 algorithm, replacing an earlier log-scaled-follower-count
// approach. Tuning these constants changes how the platform values fame —
// this is the proprietary "secret sauce" of the valuation, kept server-side
// only.

// Estimated $ revenue per 1,000 engaged followers/views/listeners, by
// platform — a business estimate of monetization density, not derived from
// any external data source. The midpoint of each range is used in scoring.
export const PLATFORM_MULTIPLIERS = {
  youtube: { min: 15, max: 30 }, // per 1K views
  tiktok: { min: 5, max: 20 },
  instagram: { min: 10, max: 25 },
  twitch: { min: 20, max: 50 },
  twitter: { min: 2, max: 10 }, // rest of the codebase keys this platform "twitter", not "x"
  spotify: { min: 3, max: 7 }, // per 1K monthly listeners
};

export const DEFAULT_PLATFORM_MULTIPLIER = { min: 5, max: 15 };

export function platformMultiplierMidpoint(platform) {
  const range = PLATFORM_MULTIPLIERS[platform] || DEFAULT_PLATFORM_MULTIPLIER;
  return (range.min + range.max) / 2;
}

// A talent qualifies for the live tradeable market only if ALL of these
// hold — deliberately a multi-factor gate, not a single score threshold, so
// a talent can't qualify purely by gaming one dimension (e.g. a huge but
// dead/bought follower count with no real engagement).
//
// requireGrowthTrend is intentionally strict with NO first-evaluation
// exception (see services/socialSnapshotService.js): growth can only be
// measured once a GROWTH_LOOKBACK_DAYS-old snapshot exists, so a brand-new
// talent cannot qualify via either qualification path on their very first
// evaluation, no matter how strong their other numbers are. Confirmed as a
// deliberate product decision, not a bug.
export const QUALIFICATION_THRESHOLDS = {
  minTotalFollowers: 50000,
  minEngagementRate: 0.02, // 2%
  minPlatforms: 2,
  requireGrowthTrend: true,
};

// Alternative qualification path: a single platform, on its own, clearing a
// meaningfully higher bar than the multi-platform path's aggregate minimums
// also qualifies — so a genuine single-platform mega-creator (e.g. a 5M-
// subscriber YouTuber with no other presence) isn't blocked purely by
// minPlatforms. Deliberately set well above QUALIFICATION_THRESHOLDS'
// minTotalFollowers/minEngagementRate (not just matching them), since a
// single platform carries more concentration risk than a diversified
// footprint — this is a business call, tune freely.
export const SINGLE_PLATFORM_QUALIFICATION = {
  minFollowers: 250000,
  minEngagementRate: 0.03, // 3%
};

// $/month estimated monetization value that maps to a full 100-point score.
export const MONETIZATION_BENCHMARK_MONTHLY = 50000;

// Score bonuses, added after the monetization-value base score (result still
// capped at 100 overall).
export const GROWTH_BONUS = 5;
export const VERIFIED_BONUS = 3;
export const MULTI_PLATFORM_BONUS_3PLUS = 5;
export const MULTI_PLATFORM_BONUS_2 = 2;

export const FAMESCORE_MAX = 100;

// Where real engagement-rate data isn't available — which is most
// platforms, most of the time, since most don't expose this without paid/
// reviewed API access this project doesn't have (see
// services/socialProviders/*.js — YouTube is currently the only platform
// with real measured engagement) — we fall back to a documented industry-
// average ASSUMPTION, never a silently fabricated "measured" number. Every
// platform contribution in a FameScore breakdown is tagged
// engagementRateSource: "measured" | "platform_default_estimate" so this
// stays visible, not hidden, in the admin dashboard.
export const DEFAULT_ENGAGEMENT_RATE_BY_PLATFORM = {
  youtube: 0.04,
  tiktok: 0.06,
  instagram: 0.03,
  facebook: 0.02,
  twitter: 0.02,
  snapchat: 0.03,
  twitch: 0.05,
  spotify: 0.01,
};
export const DEFAULT_ENGAGEMENT_RATE_FALLBACK = 0.02;

// How far back to look for a prior follower-count snapshot when computing
// growth rate (see models/socialSnapshotModel.js).
export const GROWTH_LOOKBACK_DAYS = 30;

// How often a Futures-tier (not-yet-qualified) talent's gap analysis /
// re-evaluation date gets refreshed.
export const RE_EVALUATION_DAYS = 90;

// Price curve: price = min_price + (max_price - min_price) * (score/FAMESCORE_MAX)^CURVE_EXPONENT
// Exponent > 1 skews most scores toward the lower end of the price band, with
// price escalating quickly only for top-tier FameScores — reflecting that
// real-world fame/value distributions are extremely long-tailed. Independent
// of the scoring algorithm itself — unaffected by the v1->v2 score-formula
// change, only by the FAMESCORE_MAX rescale above.
export const PRICE_CURVE_EXPONENT = 2.2;

// Re-mark (post-listing) damping: on each scheduled/triggered recalculation,
// price moves only this fraction of the distance toward the new fundamental-
// value target, then is still passed through the existing trading engine's
// max-move-per-trade / daily-move-limit / min-max clamps. This prevents a
// follower-count change from ever causing a price shock — valuation updates
// nudge the market, they don't override it.
export const REMARK_DAMPING_FACTOR = 0.15;
