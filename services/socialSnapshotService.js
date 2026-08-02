import SocialSnapshot from "../models/socialSnapshotModel.js";
import { GROWTH_LOOKBACK_DAYS } from "../config/famescoreConfig.js";

/**
 * growthRate = (current - nearestSnapshotAtLeastNDaysAgo) / thatSnapshot.
 * Returns null if no snapshot exists at least GROWTH_LOOKBACK_DAYS old yet
 * (a brand-new talent's first-ever recalculation) — this is a real "we
 * don't know" state, not the same as "0% growth."
 *
 * DELIBERATE product decision: QUALIFICATION_THRESHOLDS.requireGrowthTrend
 * is strict with no first-evaluation exception for most talents, so a
 * brand-new talent cannot qualify (via either qualification path) until
 * they have at least GROWTH_LOOKBACK_DAYS of history — even with excellent
 * followers/engagement on day one. Anti-fraud: this is exactly what
 * protects against a brand-new account with purchased/faked huge numbers.
 * A mega-scale account (see MEGA_ACCOUNT_THRESHOLD in famescoreConfig.js)
 * is exempt from this wait — see platformGrowthQualifies() in
 * famescoreService.js — since scale itself is proof enough at that size
 * and the anti-fraud concern doesn't apply.
 */
export async function computeGrowthRate(talentId, platform, currentFollowers) {
  const cutoff = new Date(Date.now() - GROWTH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const priorSnapshot = await SocialSnapshot.findOne({
    talent_id: talentId,
    platform,
    recorded_at: { $lte: cutoff },
  })
    .sort({ recorded_at: -1 })
    .lean();

  if (!priorSnapshot || priorSnapshot.followers <= 0) return null;
  return +((currentFollowers - priorSnapshot.followers) / priorSnapshot.followers).toFixed(4);
}

/**
 * Absolute (not percentage) follower delta vs. the nearest snapshot at
 * least GROWTH_LOOKBACK_DAYS old — same "nearest snapshot at cutoff"
 * lookup as computeGrowthRate, just returning the raw difference instead
 * of a ratio. Feeds the mega-account growth-qualification path, where a
 * huge account's percentage growth is naturally tiny even when real
 * absolute growth is substantial (e.g. a 237M-follower account adding
 * 500K/month is only ~0.2%). Returns null under the exact same "no history
 * yet" condition as computeGrowthRate — never fabricates 0.
 */
export async function computeAbsoluteFollowerDelta(talentId, platform, currentFollowers) {
  const cutoff = new Date(Date.now() - GROWTH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const priorSnapshot = await SocialSnapshot.findOne({
    talent_id: talentId,
    platform,
    recorded_at: { $lte: cutoff },
  })
    .sort({ recorded_at: -1 })
    .lean();

  if (!priorSnapshot) return null;
  return currentFollowers - priorSnapshot.followers;
}

/**
 * Writes one snapshot row per platform. Call this ONLY after a real
 * recalculation (the daily cron, or an admin "recalculate" action) —
 * never from a preview/what-if call, or growth-rate history gets polluted
 * with data that was never a real recalculation.
 */
export async function writeSocialSnapshots(talentId, userId, platformMetrics) {
  if (!talentId) return; // no Talent yet (first-time preview) — nothing to snapshot against
  await SocialSnapshot.insertMany(
    platformMetrics.map((p) => ({
      talent_id: talentId,
      user_id: userId,
      platform: p.platform,
      followers: p.followers,
      engagement_rate: p.engagementRate,
      engagement_rate_source: p.engagementRateSource,
      recorded_at: new Date(),
    }))
  );
}
