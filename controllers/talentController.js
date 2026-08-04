import Talent from "../models/talentModel.js";
import TalentPriceHistory from "../models/talentPriceHistoryModel.js";
import TalentMarketStats from "../models/talentMarketStatsModel.js";
import Position from "../models/positionModel.js";
import User from "../models/user.js";
import SiteSettings from "../models/siteSettingsModel.js";
import SocialConnection from "../models/socialConnection.js";
import { getQuote, getTalentChart, getTalentStats, calcBidAsk, calcPoolBidAsk } from "../services/tradingService.js";
import { resolveTalent } from "../services/talentResolver.js";
import {
  previewValuation,
  recalculateTalentValuation,
  recalculateAllTalentValuations,
} from "../services/famescoreService.js";
import { appendLedgerEntry } from "../services/ledgerService.js";
import { computeShareAllocation } from "../services/shareAllocationService.js";
import { initializeVestingAndEarnings } from "../services/vestingService.js";
import { recordRevenueEvent } from "../services/revenueTrackerService.js";
import { calculateListingFee } from "../config/feeConfig.js";
import { isKycVerified } from "../config/kycConfig.js";
import { QUALIFICATION_THRESHOLDS, SINGLE_PLATFORM_QUALIFICATION } from "../config/famescoreConfig.js";
import { createTalentSchema, updateTalentSchema, adjustPriceSchema } from "../validators/trading.js";
import mongoose from "mongoose";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

// ── Public ──────────────────────────────────────────────────────────

// GET /api/talents
export const getAllTalents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { status: "active", tier: "tradeable" };
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { symbol: { $regex: escaped, $options: "i" } },
      ];
    }

    const [talents, total] = await Promise.all([
      Talent.find(filter)
        .select("-liquidity_factor -volatility_multiplier -max_move_per_trade -max_daily_move_percent")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Talent.countDocuments(filter),
    ]);

    const items = talents.map((t) => {
      const currentPrice = parseFloat(t.current_price.toString());
      const prevClose = parseFloat((t.previous_close_price || t.current_price).toString());
      const change = +(currentPrice - prevClose).toFixed(4);
      const changePct = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
      // Compute bid/ask live so each talent quotes its own spread based on its price.
      const { bid, ask } = calcBidAsk(currentPrice, t.spread);

      return {
        _id: t._id,
        name: t.name,
        slug: t.slug,
        symbol: t.symbol,
        image: t.image,
        current_price: currentPrice,
        bid_price: bid,
        ask_price: ask,
        change_amount: change,
        change_percent: changePct,
        last_trade_at: t.last_trade_at,
      };
    });

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      talents: items,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/talents/top
export const getTopTalents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sort || "price"; // price | volume | gainers | losers | bts

    const talents = await Talent.find({ status: "active", tier: "tradeable" }).lean();
    const talentIds = talents.map((t) => t._id);

    // ── Aggregate live BTS-leaderboard fields in parallel ──────────────
    // - availableUnits / comprisedValue: derived from currently OPEN positions
    // - volume_24h / high / low : from TalentMarketStats
    // - token_brand_name        : from the talent's owning User
    const [posAgg, statsList, userList] = await Promise.all([
      Position.aggregate([
        { $match: { talent_id: { $in: talentIds }, status: "open" } },
        {
          $group: {
            _id: "$talent_id",
            unitsHeld: { $sum: { $toDouble: "$units" } },
            invested: { $sum: { $toDouble: "$invested_amount" } },
          },
        },
      ]),
      TalentMarketStats.find({ talent_id: { $in: talentIds } }).lean(),
      User.find({
        _id: {
          $in: talents.map((t) => t.userId).filter(Boolean),
        },
      })
        .select("_id token_brand_name brand_name stage_name name full_name")
        .lean(),
    ]);

    const posByTalent = new Map(posAgg.map((p) => [String(p._id), p]));
    const statsByTalent = new Map(
      statsList.map((s) => [String(s.talent_id), s])
    );
    const userByMap = new Map(userList.map((u) => [String(u._id), u]));

    let items = talents.map((t) => {
      const currentPrice = parseFloat(t.current_price.toString());
      const prevClose = parseFloat((t.previous_close_price || t.current_price).toString());
      const change = +(currentPrice - prevClose).toFixed(4);
      const changePct = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
      const { bid, ask } = calcBidAsk(currentPrice, t.spread);

      const pos = posByTalent.get(String(t._id));
      const stats = statsByTalent.get(String(t._id));
      const owner = t.userId ? userByMap.get(String(t.userId)) : null;

      const unitsHeld = pos ? Math.round(Number(pos.unitsHeld || 0)) : 0;
      const invested = pos ? +Number(pos.invested || 0).toFixed(2) : 0;
      // Real pool inventory (see services/shareAllocationService.js) — every
      // tradeable-tier talent going through the current flow has this set.
      // Falls back to the old synthetic liquidity_factor/price estimate only
      // for a legacy talent that somehow predates share allocation.
      const availableUnits = t.shares_available_in_pool != null
        ? Number(t.shares_available_in_pool)
        : Math.max(
            0,
            Math.floor(
              (currentPrice > 0 ? parseFloat((t.liquidity_factor || 0).toString()) / currentPrice : 0) - unitsHeld
            )
          );
      const volume24h = stats
        ? parseFloat(stats.volume_24h.toString())
        : 0;

      // BTS shorthand fields (additive – existing keys untouched)
      const btsWorth = +(currentPrice * unitsHeld).toFixed(2); // market value of held shares
      const comprisedValue = invested; // total $ invested in open positions
      const costPerUnit = currentPrice;
      const performance = changePct; // 24h % – frontend can switch ranges via /chart

      return {
        _id: t._id,
        name: t.name,
        slug: t.slug,
        symbol: t.symbol,
        image: t.image,
        description: t.description,
        current_price: currentPrice,
        bid_price: bid,
        ask_price: ask,
        spread: +(ask - bid).toFixed(4),
        min_price: parseFloat(t.min_price.toString()),
        max_price: parseFloat(t.max_price.toString()),
        change_amount: change,
        change_percent: changePct,
        last_trade_at: t.last_trade_at,
        userId: t.userId,
        // ── BTS leaderboard ──
        token_brand_name:
          owner?.token_brand_name ||
          owner?.brand_name ||
          owner?.stage_name ||
          owner?.full_name ||
          owner?.name ||
          t.name,
        bts_worth: btsWorth,
        comprised_value: comprisedValue,
        available_units: availableUnits,
        cost_per_unit: costPerUnit,
        change: change,
        volume: volume24h,
        performance,
      };
    });

    switch (sortBy) {
      case "gainers":
        items.sort((a, b) => b.change_percent - a.change_percent);
        break;
      case "losers":
        items.sort((a, b) => a.change_percent - b.change_percent);
        break;
      case "volume":
        items.sort((a, b) => b.volume - a.volume);
        break;
      case "bts":
        items.sort((a, b) => b.bts_worth - a.bts_worth);
        break;
      case "price":
      default:
        items.sort((a, b) => b.current_price - a.current_price);
        break;
    }

    items = items.slice(0, limit);

    res.json({ success: true, talents: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/talents/bts/leaderboard – alias of /top with sort=bts default
export const getBtsLeaderboard = async (req, res) => {
  req.query.sort = req.query.sort || "bts";
  return getTopTalents(req, res);
};

// GET /api/talents/:id
export const getTalentById = async (req, res) => {
  try {
    const resolved = await resolveTalent(req.params.id);
    if (!resolved) return res.status(404).json({ success: false, message: "Talent not found" });

    const talent = await Talent.findById(resolved._id)
      .populate("userId", "name email images role")
      .lean();
    if (!talent) return res.status(404).json({ success: false, message: "Talent not found" });

    const currentPrice = parseFloat(talent.current_price.toString());
    const prevClose = parseFloat((talent.previous_close_price || talent.current_price).toString());
    const change = +(currentPrice - prevClose).toFixed(4);
    const changePct = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
    const { bid, ask } = calcBidAsk(currentPrice, talent.spread);

    // Get market stats
    const marketStats = await TalentMarketStats.findOne({ talent_id: talent._id }).lean();

    const result = {
      _id: talent._id,
      name: talent.name,
      slug: talent.slug,
      symbol: talent.symbol,
      image: talent.image,
      description: talent.description,
      status: talent.status,
      tier: talent.tier,
      // Canonical "tradeable" definition (see models/talentModel.js) — tier
      // can only reach "tradeable" after graduateTalentToTradeable() has
      // already confirmed KYC, so this single flag covers both "qualified"
      // and "KYC passed" for the certified-tradeable badge.
      is_certified_tradeable: talent.tier === "tradeable" && talent.status === "active",
      current_price: currentPrice,
      bid_price: bid,
      ask_price: ask,
      spread: +(ask - bid).toFixed(4),
      min_price: parseFloat(talent.min_price.toString()),
      max_price: parseFloat(talent.max_price.toString()),
      change_amount: change,
      change_percent: changePct,
      last_trade_at: talent.last_trade_at,
      userId: talent.userId,
      volume_24h: marketStats ? parseFloat(marketStats.volume_24h.toString()) : 0,
      high_24h: marketStats ? parseFloat(marketStats.high_24h.toString()) : currentPrice,
      low_24h: marketStats ? parseFloat(marketStats.low_24h.toString()) : currentPrice,
    };

    res.json({ success: true, talent: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/talents/:id/quote
export const getTalentQuote = async (req, res) => {
  try {
    const quote = await getQuote(req.params.id);
    res.json({ success: true, quote });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/talents/:id/chart?range=1D|1W|1M|3M|1Y|5Y|10Y&format=ohlc|line
export const getTalentChartData = async (req, res) => {
  try {
    const range = req.query.range || "1D";
    const format = req.query.format || "ohlc";
    const data = await getTalentChart(req.params.id, range, format);
    res.json({ success: true, range, format, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/talents/:id/stats
export const getTalentStatistics = async (req, res) => {
  try {
    const stats = await getTalentStats(req.params.id);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Admin ───────────────────────────────────────────────────────────

// POST /api/admin/talents
export const createTalent = async (req, res) => {
  try {
    const data = createTalentSchema.parse(req.body);
    const minPrice = data.min_price || 1.0;
    const maxPrice = data.max_price || 100000;

    let currentPrice = data.current_price;
    let fameScoreResult = null;
    if (currentPrice == null && data.auto_price) {
      fameScoreResult = await previewValuation(data.userId, minPrice, maxPrice);
      currentPrice = fameScoreResult.suggestedPrice;
    }

    // A talent only gets gated into the futures tier on FameScore grounds
    // when we actually know a score for them (i.e. auto_price was used).
    // Separately — and unconditionally, even for manually admin-priced
    // talents — going tradeable also requires a linked, KYC-verified user.
    // An admin vouching for a talent doesn't bypass identity verification;
    // if there's no linked userId at all, there's nothing to verify against,
    // so it's treated the same as "not verified."
    const scoreQualifies = !fameScoreResult || fameScoreResult.qualified;
    const kycUser = data.userId ? await User.findById(data.userId) : null;
    const kycVerified = isKycVerified(kycUser);
    const tier = scoreQualifies && kycVerified ? "tradeable" : "futures";
    const qualifiedPendingKyc = scoreQualifies && !kycVerified;

    // Share supply is only sized here if this talent is tradeable RIGHT NOW.
    // A futures-tier talent gets its shares sized later, at graduation. A
    // manually admin-priced talent (no fameScoreResult, no monetization
    // value to size from) falls back to the share-count floor with the
    // admin-set current_price as the share price directly.
    let shareAllocation = null;
    if (tier === "tradeable") {
      shareAllocation = fameScoreResult
        ? computeShareAllocation(fameScoreResult.valuation)
        : { ...computeShareAllocation(0), initialSharePrice: currentPrice };
    }

    // When going tradeable off an auto-priced FameScore result, anchor the
    // actual trading price to the share model's initial_share_price
    // (valuation / share count) instead of the percentile-curve
    // suggestedPrice, which has no relationship to real share economics. A
    // manually admin-priced talent already uses its own current_price as
    // initialSharePrice (see the shareAllocation fallback above), so this is
    // a no-op for that branch — currentPrice stays whatever the admin set.
    if (shareAllocation && fameScoreResult) {
      currentPrice = shareAllocation.initialSharePrice;
    }

    const { bid, ask } = shareAllocation
      ? calcPoolBidAsk(currentPrice, {
          shares_in_liquidity_pool: shareAllocation.sharesInLiquidityPool,
          shares_available_in_pool: shareAllocation.sharesInLiquidityPool,
          spread: data.spread || 0.5,
        })
      : calcBidAsk(currentPrice, data.spread || 0.5);

    const talent = await Talent.create({
      ...data,
      bid_price: D128(bid),
      ask_price: D128(ask),
      current_price: D128(currentPrice),
      previous_close_price: D128(currentPrice),
      spread: D128(data.spread || 0.5),
      liquidity_factor: D128(data.liquidity_factor || 50000),
      volatility_multiplier: D128(data.volatility_multiplier || 1.0),
      min_price: D128(minPrice),
      max_price: D128(maxPrice),
      max_move_per_trade: D128(data.max_move_per_trade || 5.0),
      min_order_amount: D128(data.min_order_amount || 10),
      max_order_amount: D128(data.max_order_amount || 100000),
      tier,
      qualified_pending_kyc: qualifiedPendingKyc,
      futures_started_at: tier === "futures" ? new Date() : null,
      ...(fameScoreResult
        ? {
            fame_score: fameScoreResult.fameScore,
            fame_score_breakdown: fameScoreResult.breakdown,
            fame_score_updated_at: new Date(),
            qualified: fameScoreResult.qualified,
            qualification_reason: fameScoreResult.qualificationReason,
            estimated_monetization_value: D128(fameScoreResult.estimatedMonetizationValue),
            valuation: D128(fameScoreResult.valuation),
            valuation_breakdown: fameScoreResult.valuationBreakdown,
          }
        : {}),
      ...(shareAllocation
        ? {
            total_shares: shareAllocation.totalShares,
            shares_in_liquidity_pool: shareAllocation.sharesInLiquidityPool,
            shares_available_in_pool: shareAllocation.sharesInLiquidityPool,
            initial_share_price: D128(shareAllocation.initialSharePrice),
          }
        : {}),
    });

    if (shareAllocation) {
      await initializeVestingAndEarnings(talent, shareAllocation);
    }

    // Write initial price history
    const priceHistoryEntry = await TalentPriceHistory.create({
      talent_id: talent._id,
      price: D128(currentPrice),
      bid_price: D128(bid),
      ask_price: D128(ask),
      volume: D128(0),
      source_type: "system",
      recorded_at: new Date(),
    });
    await appendLedgerEntry(
      "talent_price_history",
      priceHistoryEntry._id,
      priceHistoryEntry.toObject()
    );

    // Listing fee — charged exactly once, only if this talent is tradeable
    // right away (matches the self-serve apply flow's rule).
    if (tier === "tradeable") {
      const listingFee = calculateListingFee(fameScoreResult ? fameScoreResult.valuation : 0);
      await recordRevenueEvent({
        event_type: "listing_fee",
        amount: listingFee,
        talent_id: talent._id,
        notes: "admin_created",
      });
    }

    res.status(201).json({ success: true, talent: talent.toDisplay() });
  } catch (err) {
    const error = err.errors?.[0]?.message || err.message;
    res.status(400).json({ success: false, message: error });
  }
};

// GET /api/admin/talents/preview-famescore?userId=...&min_price=&max_price=
export const previewFameScore = async (req, res) => {
  try {
    const { userId, min_price, max_price } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }
    const result = await previewValuation(
      userId,
      min_price ? parseFloat(min_price) : 1.0,
      max_price ? parseFloat(max_price) : 100000
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/admin/talents/:id/recalculate-valuation
export const recalculateValuation = async (req, res) => {
  try {
    const result = await recalculateTalentValuation(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/admin/talents/recalculate-all-valuations
// Manually triggers the same batch run the nightly cron performs — useful for
// testing the scheduler's underlying logic without waiting for it to fire.
export const recalculateAllValuations = async (req, res) => {
  try {
    const summary = await recalculateAllTalentValuations();
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/admin/talents/:id
export const updateTalent = async (req, res) => {
  try {
    const data = updateTalentSchema.parse(req.body);

    // Convert numeric fields to Decimal128
    const update = {};
    for (const [key, val] of Object.entries(data)) {
      const decimalFields = [
        "current_price", "spread", "liquidity_factor", "volatility_multiplier",
        "min_price", "max_price", "max_move_per_trade", "min_order_amount", "max_order_amount",
      ];
      update[key] = decimalFields.includes(key) ? D128(val) : val;
    }

    // Recalc bid/ask if price or spread changed
    if (data.current_price || data.spread) {
      const talent = await Talent.findById(req.params.id);
      if (!talent) return res.status(404).json({ success: false, message: "Talent not found" });

      const price = data.current_price || parseFloat(talent.current_price.toString());
      const spread = data.spread || parseFloat(talent.spread.toString());
      const { bid, ask } = calcBidAsk(price, spread);
      update.bid_price = D128(bid);
      update.ask_price = D128(ask);
    }

    const talent = await Talent.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!talent) return res.status(404).json({ success: false, message: "Talent not found" });

    res.json({ success: true, talent: talent.toDisplay() });
  } catch (err) {
    const error = err.errors?.[0]?.message || err.message;
    res.status(400).json({ success: false, message: error });
  }
};

// POST /api/admin/talents/:id/adjust-price
export const adjustTalentPrice = async (req, res) => {
  try {
    const data = adjustPriceSchema.parse(req.body);

    const talent = await Talent.findById(req.params.id);
    if (!talent) return res.status(404).json({ success: false, message: "Talent not found" });

    const oldPrice = parseFloat(talent.current_price.toString());
    const newPrice = data.new_price;
    const spread = parseFloat(talent.spread.toString());
    const { bid, ask } = calcBidAsk(newPrice, spread);

    talent.current_price = D128(newPrice);
    talent.bid_price = D128(bid);
    talent.ask_price = D128(ask);
    await talent.save();

    // Log to price history
    const priceHistoryEntry = await TalentPriceHistory.create({
      talent_id: talent._id,
      price: D128(newPrice),
      bid_price: D128(bid),
      ask_price: D128(ask),
      volume: D128(0),
      source_type: "admin_adjustment",
      recorded_at: new Date(),
    });
    await appendLedgerEntry(
      "talent_price_history",
      priceHistoryEntry._id,
      priceHistoryEntry.toObject()
    );

    res.json({
      success: true,
      old_price: oldPrice,
      new_price: newPrice,
      talent: talent.toDisplay(),
    });
  } catch (err) {
    const error = err.errors?.[0]?.message || err.message;
    res.status(400).json({ success: false, message: error });
  }
};

// GET /api/admin/market/logs
export const getMarketLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.talent_id) filter.talent_id = req.query.talent_id;
    if (req.query.source_type) filter.source_type = req.query.source_type;

    const [logs, total] = await Promise.all([
      TalentPriceHistory.find(filter)
        .populate("talent_id", "name symbol")
        .sort({ recorded_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TalentPriceHistory.countDocuments(filter),
    ]);

    const items = logs.map((l) => ({
      ...l,
      price: parseFloat(l.price.toString()),
      bid_price: parseFloat(l.bid_price.toString()),
      ask_price: parseFloat(l.ask_price.toString()),
      volume: parseFloat(l.volume.toString()),
    }));

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      items,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ----- Admin: upload/replace talent profile image -----
// PUT /api/admin/talents/:id/image    (multipart/form-data, field "image")
// Requires multer middleware in the route (upload.single("image")).
export const uploadTalentImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No image file provided" });
    }
    const talent = await Talent.findById(id);
    if (!talent) {
      return res
        .status(404)
        .json({ success: false, message: "Talent not found" });
    }
    // multer-s3 stores under profile/ (see utils/profile_images.js) and
    // sets req.file.location to the full public S3/CDN URL directly.
    talent.image = req.file.location;
    await talent.save();
    return res.json({ success: true, data: talent.toDisplay() });
  } catch (err) {
    console.error("uploadTalentImage error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/admin/talents/:id/featured
// Body: { featured_in_inverse: bool, inverse_order: number, priority: number }
export const updateTalentFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const update = {};
    if (typeof req.body?.featured_in_inverse === "boolean") {
      update.featured_in_inverse = req.body.featured_in_inverse;
    }
    if (Number.isFinite(req.body?.inverse_order)) {
      update.inverse_order = req.body.inverse_order;
    }
    if (Number.isFinite(req.body?.priority)) {
      update.priority = req.body.priority;
    }
    const talent = await Talent.findByIdAndUpdate(id, update, { new: true });
    if (!talent) {
      return res
        .status(404)
        .json({ success: false, message: "Talent not found" });
    }
    return res.json({ success: true, data: talent.toDisplay() });
  } catch (err) {
    console.error("updateTalentFeatured error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/talents/inverse-featured
// Public: returns talents flagged for the Inverse home section, sorted by
// inverse_order ascending, limited by SiteSettings.inverseDisplayCount.
export const getInverseFeaturedTalents = async (req, res) => {
  try {
    const settings = await SiteSettings.findOne({ singleton: "main" });
    const limit = settings?.inverseDisplayCount ?? 8;

    const talents = await Talent.find({
      status: "active",
      featured_in_inverse: true,
    })
      .sort({ inverse_order: 1, priority: -1, createdAt: -1 })
      .limit(limit);

    return res.json({
      success: true,
      items: talents.map((t) => t.toDisplay()),
    });
  } catch (err) {
    console.error("getInverseFeaturedTalents error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Featured Talent spotlight (single talent, distinct from featured_in_inverse) ──

// PUT /api/admin/talents/:id/spotlight
// Sets this talent as the single featured spotlight, clearing whichever
// talent previously held it — only one talent should have
// is_featured_spotlight true at a time.
export const setSpotlightFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const talent = await Talent.findById(id);
    if (!talent) {
      return res.status(404).json({ success: false, message: "Talent not found" });
    }
    await Talent.updateMany(
      { _id: { $ne: id }, is_featured_spotlight: true },
      { $set: { is_featured_spotlight: false } }
    );
    talent.is_featured_spotlight = true;
    await talent.save();
    return res.json({ success: true, data: talent.toDisplay() });
  } catch (err) {
    console.error("setSpotlightFeatured error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/admin/talents/:id/unspotlight
export const clearSpotlightFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const talent = await Talent.findByIdAndUpdate(
      id,
      { is_featured_spotlight: false },
      { new: true }
    );
    if (!talent) {
      return res.status(404).json({ success: false, message: "Talent not found" });
    }
    return res.json({ success: true, data: talent.toDisplay() });
  } catch (err) {
    console.error("clearSpotlightFeatured error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/talents/:id/highlight-reel (multipart, field name "video")
export const uploadHighlightReel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No video file provided" });
    }
    const talent = await Talent.findById(id);
    if (!talent) {
      return res.status(404).json({ success: false, message: "Talent not found" });
    }
    talent.highlight_reel_url = req.file.location;
    await talent.save();
    return res.json({ success: true, data: talent.toDisplay() });
  } catch (err) {
    console.error("uploadHighlightReel error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/talents/featured (public)
// Returns the current spotlight talent merged with the public-safe fields
// of the User they're linked to (name/social_* — see models/user.js;
// getTalentOverview's "profile" shape is the same convention, reused here
// so the frontend's existing TalentLinks.jsx component works unmodified).
export const getFeaturedTalent = async (req, res) => {
  try {
    const talent = await Talent.findOne({
      is_featured_spotlight: true,
      status: "active",
    }).lean();
    if (!talent) {
      return res.json({ success: true, data: null });
    }
    const [user, socialConnections] = await Promise.all([
      talent.userId
        ? User.findById(talent.userId)
            .select(
              "name full_name images social_youtube social_twitter social_tiktok social_facebook social_insta social_snap"
            )
            .lean()
        : null,
      talent.userId
        ? SocialConnection.find({ userId: talent.userId, status: "connected" })
            .select("platform avatarUrl")
            .lean()
        : [],
    ]);

    // Best-available avatar for the "no highlight reel yet" fallback.
    // YouTube/Twitter/Instagram/TikTok can all populate avatarUrl (see
    // each provider in services/socialProviders/) — YouTube preferred
    // since it's the only one with real credentials configured in
    // production today, any connected platform's avatar as fallback.
    // Stays null (falls through to talent.image on the frontend) if
    // nothing is connected/populated yet.
    const socialAvatar =
      socialConnections.find((c) => c.platform === "youtube" && c.avatarUrl)?.avatarUrl ||
      socialConnections.find((c) => c.avatarUrl)?.avatarUrl ||
      null;

    const display = Talent.hydrate ? Talent.hydrate(talent).toDisplay() : talent;
    return res.json({
      success: true,
      data: {
        ...display,
        profile: user || {},
        social_avatar_url: socialAvatar,
      },
    });
  } catch (err) {
    console.error("getFeaturedTalent error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/talents/futures-progress (admin)
// Heuristic 0-100% "how close to qualifying" score per futures-tier
// talent, to help an admin pick who to spotlight — NOT a precise
// countdown, the underlying qualification gate (config/famescoreConfig.js)
// is a hard multi-factor pass/fail, not a smooth function. Takes the
// better of the two qualification paths (multi-platform vs single-platform
// dominance), each expressed as an average of capped ratios against that
// path's thresholds.
export const getFuturesQualificationProgress = async (req, res) => {
  try {
    const futuresTalents = await Talent.find({ tier: "futures", status: "active" })
      .select("_id name userId fame_score")
      .lean();

    const results = await Promise.all(
      futuresTalents.map(async (t) => {
        try {
          const preview = await previewValuation(t.userId);
          const breakdown = preview.breakdown || [];
          const totalFollowers = breakdown.reduce((s, p) => s + (p.followers || 0), 0);
          const avgEngagementRate =
            totalFollowers > 0
              ? breakdown.reduce((s, p) => s + (p.engagementRate || 0) * (p.followers || 0), 0) /
                totalFollowers
              : 0;
          const platformCount = breakdown.length;

          const multiProgress =
            (Math.min(1, totalFollowers / QUALIFICATION_THRESHOLDS.minTotalFollowers) +
              Math.min(1, avgEngagementRate / QUALIFICATION_THRESHOLDS.minEngagementRate) +
              Math.min(1, platformCount / QUALIFICATION_THRESHOLDS.minPlatforms)) /
            3;

          const singleProgress = breakdown.length
            ? Math.max(
                ...breakdown.map(
                  (p) =>
                    (Math.min(1, (p.followers || 0) / SINGLE_PLATFORM_QUALIFICATION.minFollowers) +
                      Math.min(
                        1,
                        (p.engagementRate || 0) / SINGLE_PLATFORM_QUALIFICATION.minEngagementRate
                      )) /
                    2
                )
              )
            : 0;

          return {
            talent_id: t._id,
            name: t.name,
            fame_score: t.fame_score,
            qualified: preview.qualified,
            qualification_reason: preview.qualificationReason,
            progress_percent: Math.round(Math.max(multiProgress, singleProgress) * 100),
          };
        } catch (err) {
          return {
            talent_id: t._id,
            name: t.name,
            fame_score: t.fame_score,
            error: err.message,
            progress_percent: null,
          };
        }
      })
    );

    results.sort((a, b) => (b.progress_percent ?? -1) - (a.progress_percent ?? -1));
    return res.json({ success: true, data: results });
  } catch (err) {
    console.error("getFuturesQualificationProgress error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/talents/spotlight-candidates (admin)
// Unlike getAllTalents (public, tradeable-only), this lists BOTH tiers —
// the spotlight picker needs to search across tradeable talents (for
// "highest performing") and futures talents (for "soon to graduate") in
// one screen.
export const getSpotlightCandidates = async (req, res) => {
  try {
    const filter = { status: "active" };
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { symbol: { $regex: escaped, $options: "i" } },
      ];
    }
    const talents = await Talent.find(filter)
      .select("name symbol slug image tier fame_score valuation current_price is_featured_spotlight highlight_reel_url")
      .sort({ is_featured_spotlight: -1, tier: 1, fame_score: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, data: talents.map((t) => ({
      ...t,
      valuation: t.valuation ? parseFloat(t.valuation.toString()) : null,
      current_price: t.current_price ? parseFloat(t.current_price.toString()) : null,
    })) });
  } catch (err) {
    console.error("getSpotlightCandidates error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};