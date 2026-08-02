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
// evaluation, no matter how strong their other numbers are. Deliberate
// anti-fraud protection — a brand-new account with huge day-one numbers is
// exactly what requiring real growth history guards against.
//
// EXCEPTION (v3): a mega-scale account (see MEGA_ACCOUNT_THRESHOLD below)
// is exempt from this wait on its first-ever evaluation — see
// platformGrowthQualifies() in famescoreService.js. Forcing a real
// production case (a 274M-follower creator) to wait 30 days before even
// being considered blocked exactly the mega-creators this system most
// wants; at that scale, the follower count itself is proof enough, and the
// anti-fraud concern that justifies the wait for smaller/newer accounts
// doesn't apply to an account already independently verified at this size.
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
// GROWTH_BONUS is superseded by GROWTH_MULTIPLIER_TIERS/growthMultiplierFor
// below (v3) — left declared-but-unused rather than deleted, matching this
// codebase's precedent for deprecated-but-not-removed constants.
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

// Growth-qualification tiering (v3) — fixes a real production case: a
// 237M-follower account was blocked from qualifying because its ~0% growth
// (completely normal at that scale) was treated identically to a dead
// account under the old flat "any positive growth" rule. Requirement now
// scales with account maturity/size instead of one flat bar for everyone.
export const MATURE_ACCOUNT_AGE_MONTHS = 6;
export const NEW_ACCOUNT_GROWTH_FLOOR = 0.01; // new/young accounts must show real (not just barely-positive) growth — anti-fraud
export const MATURE_ACCOUNT_GROWTH_FLOOR = -0.05; // established accounts: plateau/mild decline is normal, not "dead"
export const MEGA_ACCOUNT_THRESHOLD = 2_000_000; // total platform followers — also reused as Phase B's cultural-metrics activation gate
export const MEGA_ACCOUNT_ABSOLUTE_GROWTH_FLOOR = 500_000; // absolute followers/month — alternate proof of growth when % growth is naturally tiny at this scale

// Per-platform growth multiplier (v3) — REPLACES the flat GROWTH_BONUS
// below. Applied to each platform's monetization value (STEP 1 of
// calculateFameScore) instead of a flat +5 added once to the whole score
// regardless of growth magnitude, so +1% growth and +200% viral growth no
// longer get identical credit. GROWTH_BONUS is left declared-but-unused
// rather than deleted, matching this codebase's existing precedent for
// deprecated-but-not-removed constants (see TARGET_ANCHOR_PRICE in
// marketMakingConfig.js).
export const GROWTH_MULTIPLIER_TIERS = [
  { max: MATURE_ACCOUNT_GROWTH_FLOOR, label: "declining", multiplier: 0.95 },
  { max: NEW_ACCOUNT_GROWTH_FLOOR, label: "flat", multiplier: 1.0 },
  { max: 0.1, label: "growing", multiplier: 1.05 },
  { max: 0.3, label: "high_growth", multiplier: 1.1 },
  { max: Infinity, label: "viral", multiplier: 1.15 },
];

export function growthMultiplierFor(growthRate) {
  if (typeof growthRate !== "number") return 1.0; // no signal yet — neutral, never penalize an unmeasured platform
  return (
    GROWTH_MULTIPLIER_TIERS.find((t) => growthRate <= t.max) ??
    GROWTH_MULTIPLIER_TIERS.at(-1)
  ).multiplier;
}

export function growthTierFor(growthRate) {
  if (typeof growthRate !== "number") return null;
  return (
    GROWTH_MULTIPLIER_TIERS.find((t) => growthRate <= t.max) ??
    GROWTH_MULTIPLIER_TIERS.at(-1)
  ).label;
}

// YouTube-only: a second monetization-density estimate based on lifetime
// avg views/video, used as max(subscriber_value, views_value) so a channel
// with a huge back-catalog of views but currently-modest subscriber
// engagement isn't undervalued. Business estimate, tune freely — same
// spirit as PLATFORM_MULTIPLIERS above.
export const YOUTUBE_VIEWS_VALUE_RATE = { min: 8, max: 18 }; // $ per 1K monthly-avg views

export function youtubeViewsValueRateMidpoint() {
  return (YOUTUBE_VIEWS_VALUE_RATE.min + YOUTUBE_VIEWS_VALUE_RATE.max) / 2;
}

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
