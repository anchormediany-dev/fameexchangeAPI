import Position from "../models/positionModel.js";
import Talent from "../models/talentModel.js";
import { closePreview, closeTrade } from "../services/tradingService.js";

const decimalToFloat = (v) => (v ? parseFloat(v.toString()) : null);

// GET /api/positions/open
export const getOpenPositions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { user_id: req.user._id, status: "open" };
    if (req.query.talent_id) filter.talent_id = req.query.talent_id;

    const [positions, total] = await Promise.all([
      Position.find(filter)
        .populate("talent_id", "name symbol image current_price bid_price ask_price spread")
        .sort({ opened_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Position.countDocuments(filter),
    ]);

    const items = positions.map((pos) => {
      const talent = pos.talent_id;
      const units = decimalToFloat(pos.units);
      const entryPrice = decimalToFloat(pos.entry_price);
      const invested = decimalToFloat(pos.invested_amount);

      let currentPrice = 0;
      let bid = 0;
      let ask = 0;
      let unrealizedPnl = 0;

      if (talent && talent.current_price) {
        currentPrice = parseFloat(talent.current_price.toString());
        const spread = parseFloat(talent.spread.toString());
        bid = +(currentPrice - spread / 2).toFixed(4);
        ask = +(currentPrice + spread / 2).toFixed(4);

        if (pos.side === "buy") {
          unrealizedPnl = +((bid - entryPrice) * units).toFixed(2);
        } else {
          unrealizedPnl = +((entryPrice - ask) * units).toFixed(2);
        }
      }

      return {
        _id: pos._id,
        talent_name: talent?.name || "Unknown",
        talent_symbol: talent?.symbol || "",
        talent_image: talent?.image || null,
        talent_id: talent?._id || pos.talent_id,
        side: pos.side,
        entry_price: entryPrice,
        current_price: currentPrice,
        units,
        invested_amount: invested,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_percent:
          invested > 0 ? +((unrealizedPnl / invested) * 100).toFixed(2) : 0,
        opened_at: pos.opened_at,
      };
    });

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      positions: items,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/positions/:id
export const getPositionById = async (req, res) => {
  try {
    const position = await Position.findOne({ _id: req.params.id, user_id: req.user._id })
      .populate("talent_id", "name symbol image current_price bid_price ask_price spread")
      .lean();

    if (!position) return res.status(404).json({ success: false, message: "Position not found" });

    const talent = position.talent_id;
    const units = decimalToFloat(position.units);
    const entryPrice = decimalToFloat(position.entry_price);
    const invested = decimalToFloat(position.invested_amount);

    let currentPrice = 0;
    let unrealizedPnl = 0;

    if (talent?.current_price) {
      currentPrice = parseFloat(talent.current_price.toString());
      const spread = parseFloat(talent.spread.toString());
      const bid = +(currentPrice - spread / 2).toFixed(4);
      const ask = +(currentPrice + spread / 2).toFixed(4);

      if (position.side === "buy") {
        unrealizedPnl = +((bid - entryPrice) * units).toFixed(2);
      } else {
        unrealizedPnl = +((entryPrice - ask) * units).toFixed(2);
      }
    }

    res.json({
      success: true,
      position: {
        _id: position._id,
        talent_name: talent?.name || "Unknown",
        talent_symbol: talent?.symbol || "",
        talent_image: talent?.image || null,
        talent_id: talent?._id || position.talent_id,
        side: position.side,
        entry_price: entryPrice,
        current_price: currentPrice,
        units,
        invested_amount: invested,
        unrealized_pnl: unrealizedPnl,
        status: position.status,
        opened_at: position.opened_at,
        closed_at: position.closed_at,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/positions/:id/close-preview
export const positionClosePreview = async (req, res) => {
  try {
    const result = await closePreview(req.params.id, req.user._id);
    res.json({ success: true, preview: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/positions/:id/close
export const positionClose = async (req, res) => {
  try {
    const result = await closeTrade(req.params.id, req.user._id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
