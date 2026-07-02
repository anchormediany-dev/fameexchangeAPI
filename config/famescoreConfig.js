// Proprietary "FameScore" valuation engine configuration.
//
// FameScore converts a talent's social presence into a single 0-1000 score,
// which is then mapped onto their tradable price band. Tuning these constants
// changes how the platform values fame across platforms — this is the
// proprietary "secret sauce" of the valuation, kept server-side only.

// Relative importance of each platform's follower count. These are business
// calls (e.g. YouTube/TikTok audiences tend to be more monetizable/attention-
// dense than X/Twitter), not derived from any external source.
export const PLATFORM_WEIGHT = {
  youtube: 1.2,
  tiktok: 1.15,
  instagram: 1.0,
  facebook: 0.8,
  twitter: 0.85,
  snapchat: 0.9,
};

// A connection's contribution is multiplied by this depending on how the
// follower count was obtained. OAuth-verified, platform-API-sourced counts
// (SocialConnection) are trusted fully. Legacy/public-scrape-derived counts
// (Networth) are discounted since they're easier to be stale, wrong, or
// spoofed (public profile scraping has no ownership proof).
export const VERIFICATION_MULTIPLIER = {
  oauth_verified: 1.0,
  scraped_unverified: 0.5,
};

// Reference ceiling per platform used to normalize log-scaled follower counts
// into the 0-1000 FameScore range. A talent hitting this many followers on a
// given platform contributes that platform's full weight to the score.
export const PLATFORM_REFERENCE_FOLLOWERS = {
  youtube: 50_000_000,
  tiktok: 50_000_000,
  instagram: 50_000_000,
  facebook: 30_000_000,
  twitter: 30_000_000,
  snapchat: 30_000_000,
};

export const FAMESCORE_MAX = 1000;

// FameScore combines a talent's strongest platform with a smaller bonus for
// presence on additional platforms, rather than requiring strength on every
// platform at once (which would make single-platform mega-creators
// impossible to score highly). PRIMARY_WEIGHT applies to the single best
// platform; SECONDARY_WEIGHT applies to the average of the rest.
export const PRIMARY_WEIGHT = 0.7;
export const SECONDARY_WEIGHT = 0.3;

// Price curve: price = min_price + (max_price - min_price) * (score/1000)^CURVE_EXPONENT
// Exponent > 1 skews most scores toward the lower end of the price band, with
// price escalating quickly only for top-tier FameScores — reflecting that
// real-world fame/value distributions are extremely long-tailed.
export const PRICE_CURVE_EXPONENT = 2.2;

// Re-mark (post-listing) damping: on each scheduled/triggered recalculation,
// price moves only this fraction of the distance toward the new fundamental-
// value target, then is still passed through the existing trading engine's
// max-move-per-trade / daily-move-limit / min-max clamps. This prevents a
// follower-count change from ever causing a price shock — valuation updates
// nudge the market, they don't override it.
export const REMARK_DAMPING_FACTOR = 0.15;
