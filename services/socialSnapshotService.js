import SocialSnapshot from "../models/socialSnapshotModel.js";
import { GROWTH_LOOKBACK_DAYS } from "../config/famescoreConfig.js";

/**
 * growthRate = (current - nearestSnapshotAtLeastNDaysAgo) / thatSnapshot.
 * Returns null if no snapshot exists at least GROWTH_LOOKBACK_DAYS old yet
 * (a brand-new talent's first-ever recalculation) — this is a real "we
 * don't know" state, not the same as "0% growth."
 *
 * DELIBERATE product decision: QUALIFICATION_THRESHOLDS.requireGrowthTrend
 * is strict with no first-evaluation exception, so a brand-new talent
 * cannot qualify (via either qualification path) until they have at least
 * GROWTH_LOOKBACK_DAYS of history showing positive growth — even with
 * excellent followers/engagement on day one. This was confirmed
 * intentional, not a bug to fix.
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
