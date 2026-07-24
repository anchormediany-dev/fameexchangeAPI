import Talent from "../models/talentModel.js";
import RevenueEvent from "../models/revenueEventModel.js";
import { getRevenueSummary, getAssetRevenue } from "../services/revenueTrackerService.js";
import { calculateListingFee } from "../config/feeConfig.js";

const d128ToNumber = (v) => (v ? parseFloat(v.toString()) : null);

// GET /api/admin/revenue/summary?start_date=&end_date=
export const getRevenueSummaryHandler = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const summary = await getRevenueSummary(start_date, end_date);
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/revenue/by-asset/:assetId
export const getAssetRevenueHandler = async (req, res) => {
  try {
    const revenue = await getAssetRevenue(req.params.assetId);
    res.json({ success: true, ...revenue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/famescore/dashboard — read-only reporting table + summary
// stats for the admin FameScore dashboard. No editable settings (thresholds/
// fees stay code constants, per product decision).
export const getFameScoreDashboard = async (req, res) => {
  try {
    const talents = await Talent.find({ fame_score: { $ne: null } })
      .select(
        "name symbol tier status fame_score qualified qualification_reason fame_score_breakdown estimated_monetization_value valuation current_price total_shares shares_in_liquidity_pool shares_available_in_pool initial_share_price next_re_evaluation_at createdAt"
      )
      .sort({ fame_score: -1 })
      .lean();

    const revenueByTalent = await RevenueEvent.aggregate([
      { $group: { _id: "$talent_id", total: { $sum: { $toDouble: "$amount" } } } },
    ]);
    const revenueMap = new Map(revenueByTalent.map((r) => [String(r._id), r.total]));

    const rows = talents.map((t) => {
      const valuation = d128ToNumber(t.valuation);
      const currentPrice = d128ToNumber(t.current_price);
      return {
        _id: t._id,
        name: t.name,
        symbol: t.symbol,
        tier: t.tier,
        status: t.status,
        fame_score: t.fame_score,
        qualified: t.qualified,
        qualification_reason: t.qualification_reason,
        platform_count: Array.isArray(t.fame_score_breakdown) ? t.fame_score_breakdown.length : 0,
        estimated_monetization_value: d128ToNumber(t.estimated_monetization_value),
        valuation,
        initial_share_price: d128ToNumber(t.initial_share_price),
        total_shares: t.total_shares,
        shares_in_liquidity_pool: t.shares_in_liquidity_pool,
        shares_available_in_pool: t.shares_available_in_pool,
        market_cap: currentPrice != null && t.total_shares ? +(currentPrice * t.total_shares).toFixed(2) : null,
        listing_fee: valuation != null ? calculateListingFee(valuation) : null,
        next_re_evaluation_at: t.next_re_evaluation_at,
        total_revenue: +(revenueMap.get(String(t._id)) || 0).toFixed(2),
      };
    });

    const totalEvaluated = rows.length;
    const qualifiedCount = rows.filter((r) => r.qualified).length;
    const avgScore = totalEvaluated > 0
      ? +(rows.reduce((sum, r) => sum + (r.fame_score || 0), 0) / totalEvaluated).toFixed(1)
      : 0;
    const revenueSummary = await getRevenueSummary();

    res.json({
      success: true,
      talents: rows,
      summary: {
        total_evaluated: totalEvaluated,
        qualified_count: qualifiedCount,
        routed_to_futures_count: totalEvaluated - qualifiedCount,
        avg_score: avgScore,
        revenue: revenueSummary,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
