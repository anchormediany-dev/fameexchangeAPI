import { previewTrade, openTrade, closeTrade, closePreview } from "../services/tradingService.js";
import { tradePreviewSchema, tradeOpenSchema } from "../validators/trading.js";
import Trade from "../models/tradeModel.js";
import Position from "../models/positionModel.js";
import Talent from "../models/talentModel.js";

// ── Trade preview ───────────────────────────────────────────────────

// POST /api/trades/preview
export const tradePreview = async (req, res) => {
  try {
    const data = tradePreviewSchema.parse(req.body);
    const result = await previewTrade(req.user._id, data.talent_id, data.side, data.amount);
    res.json({ success: true, preview: result });
  } catch (err) {
    const error = err.errors?.[0]?.message || err.message;
    res.status(400).json({ success: false, message: error });
  }
};

// ── Open trade ──────────────────────────────────────────────────────

// POST /api/trades/open
export const tradeOpen = async (req, res) => {
  try {
    const data = tradeOpenSchema.parse(req.body);
    const result = await openTrade(
      req.user._id,
      data.talent_id,
      data.side,
      data.amount,
      data.quote_price,
      data.idempotency_key
    );
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    const error = err.errors?.[0]?.message || err.message;
    res.status(400).json({ success: false, message: error });
  }
};

// ── Trade history ───────────────────────────────────────────────────

const decimalToFloat = (v) => (v ? parseFloat(v.toString()) : null);

// GET /api/trades/history
export const getTradeHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { user_id: req.user._id };

    if (req.query.talent_id) filter.talent_id = req.query.talent_id;
    if (req.query.side) filter.side = req.query.side;
    if (req.query.trade_type) filter.trade_type = req.query.trade_type;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [trades, total] = await Promise.all([
      Trade.find(filter)
        .populate("talent_id", "name symbol image")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Trade.countDocuments(filter),
    ]);

    // Realized P&L summary
    const realizedFilter = { user_id: req.user._id, trade_type: "close", pnl: { $ne: null } };
    const realizedAgg = await Trade.aggregate([
      { $match: realizedFilter },
      { $group: { _id: null, total: { $sum: "$pnl" } } },
    ]);

    // Unrealized P&L from open positions
    const openPositions = await Position.find({ user_id: req.user._id, status: "open" }).lean();
    let unrealizedPnl = 0;
    for (const pos of openPositions) {
      const talent = await Talent.findById(pos.talent_id).lean();
      if (!talent) continue;
      const cp = parseFloat(talent.current_price.toString());
      const sp = parseFloat(talent.spread.toString());
      const bid = cp - sp / 2;
      const ask = cp + sp / 2;
      const units = parseFloat(pos.units.toString());
      const entry = parseFloat(pos.entry_price.toString());
      if (pos.side === "buy") unrealizedPnl += (bid - entry) * units;
      else unrealizedPnl += (entry - ask) * units;
    }

    const items = trades.map((t) => ({
      trade_id: t._id,
      talent_name: t.talent_id?.name || "Unknown",
      talent_symbol: t.talent_id?.symbol || "",
      talent_image: t.talent_id?.image || null,
      side: t.side,
      trade_type: t.trade_type,
      price: decimalToFloat(t.price),
      amount: decimalToFloat(t.amount),
      units: decimalToFloat(t.units),
      fee: decimalToFloat(t.fees),
      pnl: decimalToFloat(t.pnl),
      wallet_balance_after: decimalToFloat(t.wallet_balance_after),
      reference_no: t.reference_no,
      status: "executed",
      created_at: t.createdAt,
    }));

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      items,
      summary: {
        total_trades: total,
        realized_pnl: realizedAgg[0] ? +parseFloat(realizedAgg[0].total.toString()).toFixed(2) : 0,
        unrealized_pnl: +unrealizedPnl.toFixed(2),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/trades/history/:tradeId
export const getTradeById = async (req, res) => {
  try {
    const trade = await Trade.findOne({ _id: req.params.tradeId, user_id: req.user._id })
      .populate("talent_id", "name symbol image")
      .populate("position_id")
      .lean();

    if (!trade) return res.status(404).json({ success: false, message: "Trade not found" });

    res.json({
      success: true,
      trade: {
        ...trade,
        price: decimalToFloat(trade.price),
        amount: decimalToFloat(trade.amount),
        units: decimalToFloat(trade.units),
        fees: decimalToFloat(trade.fees),
        pnl: decimalToFloat(trade.pnl),
        wallet_balance_after: decimalToFloat(trade.wallet_balance_after),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
