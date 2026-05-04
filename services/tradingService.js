import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import Position from "../models/positionModel.js";
import PositionClosure from "../models/positionClosureModel.js";
import Trade from "../models/tradeModel.js";
import Wallet from "../models/walletModel.js";
import WalletTransaction from "../models/walletTransactionModel.js";
import TalentPriceHistory from "../models/talentPriceHistoryModel.js";
import TalentMarketStats from "../models/talentMarketStatsModel.js";
import { resolveTalent } from "./talentResolver.js";

const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);
const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

// ── Fee config ──────────────────────────────────────────────────────
const FEE_RATE = 0.005; // 0.5%
const QUOTE_EXPIRY_SECONDS = 10;

// Dynamic bid/ask spread configuration.
// The spread scales with the talent's price so each talent quotes its own bid/ask.
// `MIN_SPREAD` is the floor used when a talent has no price data yet.
const SPREAD_PERCENT = 0.005; // 0.5% of current price
const MIN_SPREAD = 0.01;

// ── Price helpers ───────────────────────────────────────────────────
// `storedSpread` is kept for backward-compatibility with the persisted field but
// the effective spread is always derived from the live price so bid/ask reflect
// the value of THIS talent (not a flat default shared by all of them).
function effectiveSpread(currentPrice, storedSpread) {
  const p = d(currentPrice);
  const dynamic = Math.max(MIN_SPREAD, +(p * SPREAD_PERCENT).toFixed(4));
  const stored = d(storedSpread);
  // If an admin has explicitly set a spread > the dynamic value, honor it.
  return stored > dynamic ? stored : dynamic;
}

function calcBidAsk(currentPrice, spread) {
  const p = d(currentPrice);
  const s = effectiveSpread(p, spread);
  return {
    bid: +(p - s / 2).toFixed(4),
    ask: +(p + s / 2).toFixed(4),
  };
}

export { calcBidAsk, effectiveSpread };

// ── Optional transaction helper ─────────────────────────────────────
// MongoDB multi-document transactions require a replica set / mongos.
// Standalone dev installs throw "transaction numbers are only allowed on a
// replica set member or mongos". This helper tries a transaction first and
// transparently falls back to a non-transactional run when unsupported.
async function withOptionalTransaction(fn) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    return await fn(null);
  }
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    try { await session.abortTransaction(); } catch { /* ignore */ }
    const msg = String(err?.message || "");
    const unsupported =
      err?.code === 20 ||
      err?.codeName === "IllegalOperation" ||
      msg.includes("replica set member or mongos") ||
      msg.includes("Transaction numbers") ||
      msg.includes("transaction numbers");
    if (unsupported) {
      return await fn(null);
    }
    throw err;
  } finally {
    try { session.endSession(); } catch { /* ignore */ }
  }
}

function calcMarketImpact(amount, liquidityFactor, volatilityMultiplier) {
  const a = d(amount);
  const lf = d(liquidityFactor);
  const vm = d(volatilityMultiplier);
  if (lf === 0) return 0;
  return +((a / lf) * vm).toFixed(4);
}

function clampPrice(newPrice, talent) {
  const min = d(talent.min_price);
  const max = d(talent.max_price);
  return Math.min(Math.max(newPrice, min), max);
}

function enforceMaxMovePerTrade(oldPrice, newPrice, maxMove) {
  const mm = d(maxMove);
  const diff = newPrice - oldPrice;
  if (Math.abs(diff) > mm) {
    return oldPrice + Math.sign(diff) * mm;
  }
  return newPrice;
}

function enforceDailyLimit(newPrice, previousClose, maxDailyPct) {
  const pc = d(previousClose);
  if (pc <= 0) return newPrice;
  const maxMove = pc * (maxDailyPct / 100);
  const diff = newPrice - pc;
  if (Math.abs(diff) > maxMove) {
    return pc + Math.sign(diff) * maxMove;
  }
  return newPrice;
}

// ── Quote ───────────────────────────────────────────────────────────
export async function getQuote(talentId) {
  const talent = await resolveTalent(talentId);
  if (!talent) throw new Error("Talent not found");
  if (talent.status !== "active") throw new Error("Talent is not active for trading");

  const { bid, ask } = calcBidAsk(talent.current_price, talent.spread);
  return {
    talent_id: talent._id,
    current_price: d(talent.current_price),
    bid,
    ask,
    spread: d(talent.spread),
    timestamp: new Date(),
    expires_at: new Date(Date.now() + QUOTE_EXPIRY_SECONDS * 1000),
  };
}

// ── Preview ─────────────────────────────────────────────────────────
export async function previewTrade(userId, talentId, side, amount) {
  const talent = await resolveTalent(talentId);
  if (!talent) throw new Error("Talent not found");
  if (talent.status !== "active") throw new Error("Talent is not active for trading");

  const { bid, ask } = calcBidAsk(talent.current_price, talent.spread);
  const entryPrice = side === "buy" ? ask : bid;
  const units = +(amount / entryPrice).toFixed(6);
  const fee = +(amount * FEE_RATE).toFixed(2);
  const totalRequired = +(amount + fee).toFixed(2);

  const wallet = await Wallet.findOne({ userId });
  const walletBalance = wallet ? d(wallet.available_balance) : 0;

  return {
    talent_id: talent._id,
    resolved_talent_id: talent._id,
    side,
    entry_price: entryPrice,
    estimated_units: units,
    fee,
    total_required: totalRequired,
    wallet_balance: walletBalance,
    can_execute: walletBalance >= totalRequired,
    quote_expires_in_seconds: QUOTE_EXPIRY_SECONDS,
  };
}

// ── Open trade ──────────────────────────────────────────────────────
export async function openTrade(userId, talentId, side, amount, quotePrice, idempotencyKey) {
  // Idempotency check
  if (idempotencyKey) {
    const existing = await Trade.findOne({ idempotency_key: idempotencyKey });
    if (existing) {
      const position = await Position.findById(existing.position_id);
      const wallet = await Wallet.findOne({ userId });
      return { trade: existing, position, wallet: wallet?.toDisplay() };
    }
  }

  return await withOptionalTransaction(async (session) => {
    // Step 1 – Load talent (accept Talent._id or User._id)
    const resolved = await resolveTalent(talentId);
    if (!resolved) throw new Error("Talent not found");
    const talent = await Talent.findById(resolved._id).session(session);
    if (!talent) throw new Error("Talent not found");
    if (talent.status !== "active") throw new Error("Talent is not active for trading");
    talentId = talent._id;

    // Step 2 – Validate order size
    const minOrder = d(talent.min_order_amount);
    const maxOrder = d(talent.max_order_amount);
    if (amount < minOrder) throw new Error(`Minimum order amount is $${minOrder}`);
    if (amount > maxOrder) throw new Error(`Maximum order amount is $${maxOrder}`);

    // Step 3 – Current quote
    const { bid, ask } = calcBidAsk(talent.current_price, talent.spread);
    const entryPrice = side === "buy" ? ask : bid;

    // Step 4 – Quote slippage check (allow 1% slippage from quoted price)
    if (quotePrice) {
      const slippage = Math.abs(entryPrice - quotePrice) / quotePrice;
      if (slippage > 0.01) throw new Error("Price has moved significantly. Please refresh your quote.");
    }

    // Step 5 – Wallet check
    const fee = +(amount * FEE_RATE).toFixed(2);
    const totalRequired = +(amount + fee).toFixed(2);

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) throw new Error("Wallet not found. Please contact support.");
    const availBal = d(wallet.available_balance);
    if (availBal < totalRequired) throw new Error("Insufficient wallet balance");

    // Step 6 – Calc units
    const units = +(amount / entryPrice).toFixed(6);

    // Step 7 – Create position
    const [position] = await Position.create(
      [
        {
          user_id: userId,
          talent_id: talentId,
          side,
          entry_price: D128(entryPrice),
          current_price_snapshot: D128(d(talent.current_price)),
          units: D128(units),
          invested_amount: D128(amount),
          status: "open",
          opened_at: new Date(),
        },
      ],
      { session }
    );

    // Step 8 – Wallet debit
    const balanceBefore = availBal;
    const balanceAfter = +(balanceBefore - totalRequired).toFixed(2);

    wallet.available_balance = D128(balanceAfter);
    await wallet.save({ session });

    // Step 9 – Trade log
    const [trade] = await Trade.create(
      [
        {
          user_id: userId,
          talent_id: talentId,
          position_id: position._id,
          side,
          trade_type: "open",
          price: D128(entryPrice),
          units: D128(units),
          amount: D128(amount),
          fees: D128(fee),
          pnl: null,
          wallet_balance_after: D128(balanceAfter),
          idempotency_key: idempotencyKey || undefined,
        },
      ],
      { session }
    );

    // Step 10 – Wallet transaction log
    await WalletTransaction.create(
      [
        {
          user_id: userId,
          type: "trade_open",
          amount: D128(totalRequired),
          balance_before: D128(balanceBefore),
          balance_after: D128(balanceAfter),
          reference_id: trade._id,
          reference_type: "trade",
        },
      ],
      { session }
    );

    // Step 11 – Update talent price (market impact)
    const impact = calcMarketImpact(amount, talent.liquidity_factor, talent.volatility_multiplier);
    let rawNewPrice = d(talent.current_price) + (side === "buy" ? impact : -impact);
    rawNewPrice = enforceMaxMovePerTrade(d(talent.current_price), rawNewPrice, talent.max_move_per_trade);
    rawNewPrice = enforceDailyLimit(rawNewPrice, talent.previous_close_price, talent.max_daily_move_percent);
    const newPrice = +clampPrice(rawNewPrice, talent).toFixed(4);

    const newSpread = d(talent.spread);
    const newBidAsk = calcBidAsk(newPrice, newSpread);

    talent.current_price = D128(newPrice);
    talent.bid_price = D128(newBidAsk.bid);
    talent.ask_price = D128(newBidAsk.ask);
    talent.last_trade_at = new Date();
    await talent.save({ session });

    // Step 12 – Price history
    await TalentPriceHistory.create(
      [
        {
          talent_id: talentId,
          price: D128(newPrice),
          bid_price: D128(newBidAsk.bid),
          ask_price: D128(newBidAsk.ask),
          volume: D128(amount),
          source_type: "trade",
          source_trade_id: trade._id,
          recorded_at: new Date(),
        },
      ],
      { session }
    );

    // Step 13 – Update market stats
    await TalentMarketStats.findOneAndUpdate(
      { talent_id: talentId },
      {
        $inc: {
          volume_24h: D128(amount),
          ...(side === "buy"
            ? { net_buy_pressure: D128(amount) }
            : { net_sell_pressure: D128(amount) }),
        },
        $set: {
          high_24h: D128(Math.max(newPrice, 0)),
          low_24h: D128(Math.min(newPrice, 999999)),
        },
      },
      { upsert: true, session }
    );

    return {
      trade,
      position,
      wallet: wallet.toDisplay(),
      updated_quote: {
        current_price: newPrice,
        bid: newBidAsk.bid,
        ask: newBidAsk.ask,
      },
    };
  });
}

// ── Close preview ───────────────────────────────────────────────────
export async function closePreview(positionId, userId) {
  const position = await Position.findOne({ _id: positionId, user_id: userId });
  if (!position) throw new Error("Position not found");
  if (position.status !== "open") throw new Error("Position is already closed");

  const talent = await Talent.findById(position.talent_id);
  if (!talent) throw new Error("Talent not found");

  const { bid, ask } = calcBidAsk(talent.current_price, talent.spread);
  const exitPrice = position.side === "buy" ? bid : ask;

  const units = d(position.units);
  const entryPrice = d(position.entry_price);
  const invested = d(position.invested_amount);

  let pnl;
  if (position.side === "buy") {
    pnl = +((exitPrice - entryPrice) * units).toFixed(2);
  } else {
    pnl = +((entryPrice - exitPrice) * units).toFixed(2);
  }

  const fee = +(Math.abs(exitPrice * units) * FEE_RATE).toFixed(2);
  const netSettlement = +(invested + pnl - fee).toFixed(2);

  return {
    position_id: position._id,
    talent_id: position.talent_id,
    side: position.side,
    entry_price: entryPrice,
    exit_price: exitPrice,
    units,
    invested_amount: invested,
    realized_pnl: pnl,
    fees: fee,
    net_settlement: netSettlement,
  };
}

// ── Close trade ─────────────────────────────────────────────────────
export async function closeTrade(positionId, userId) {
  return await withOptionalTransaction(async (session) => {
    // Step 1 – Load position
    const position = await Position.findOne({ _id: positionId, user_id: userId }).session(session);
    if (!position) throw new Error("Position not found");
    if (position.status !== "open") throw new Error("Position is already closed");

    // Step 2 – Load talent
    const talent = await Talent.findById(position.talent_id).session(session);
    if (!talent) throw new Error("Talent not found");

    // Step 3 – Calculate exit
    const { bid, ask } = calcBidAsk(talent.current_price, talent.spread);
    const exitPrice = position.side === "buy" ? bid : ask;
    const units = d(position.units);
    const entryPrice = d(position.entry_price);
    const invested = d(position.invested_amount);

    let pnl;
    if (position.side === "buy") {
      pnl = +((exitPrice - entryPrice) * units).toFixed(2);
    } else {
      pnl = +((entryPrice - exitPrice) * units).toFixed(2);
    }

    const fee = +(Math.abs(exitPrice * units) * FEE_RATE).toFixed(2);
    const netSettlement = +(invested + pnl - fee).toFixed(2);

    // Step 4 – Close position
    position.status = "closed";
    position.closed_at = new Date();
    position.current_price_snapshot = D128(d(talent.current_price));
    await position.save({ session });

    // Step 5 – Position closure
    const [closure] = await PositionClosure.create(
      [
        {
          position_id: position._id,
          exit_price: D128(exitPrice),
          realized_pnl: D128(pnl),
          fees: D128(fee),
          closed_at: new Date(),
        },
      ],
      { session }
    );

    // Step 6 – Wallet credit
    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) throw new Error("Wallet not found");

    const balanceBefore = d(wallet.available_balance);
    const balanceAfter = +(balanceBefore + netSettlement).toFixed(2);
    wallet.available_balance = D128(Math.max(balanceAfter, 0));
    await wallet.save({ session });

    // Step 7 – Trade log
    const [trade] = await Trade.create(
      [
        {
          user_id: userId,
          talent_id: position.talent_id,
          position_id: position._id,
          side: position.side,
          trade_type: "close",
          price: D128(exitPrice),
          units: D128(units),
          amount: D128(Math.abs(netSettlement)),
          fees: D128(fee),
          pnl: D128(pnl),
          wallet_balance_after: D128(Math.max(balanceAfter, 0)),
        },
      ],
      { session }
    );

    // Step 8 – Wallet transaction log
    await WalletTransaction.create(
      [
        {
          user_id: userId,
          type: "trade_close",
          amount: D128(netSettlement),
          balance_before: D128(balanceBefore),
          balance_after: D128(Math.max(balanceAfter, 0)),
          reference_id: trade._id,
          reference_type: "trade",
        },
      ],
      { session }
    );

    // Step 9 – Update talent price (closing order pressure)
    const closeAmount = Math.abs(exitPrice * units);
    const impact = calcMarketImpact(closeAmount, talent.liquidity_factor, talent.volatility_multiplier);

    // Closing a BUY = sell pressure; closing a SELL = buy pressure
    const priceDirection = position.side === "buy" ? -impact : impact;
    let rawNewPrice = d(talent.current_price) + priceDirection;
    rawNewPrice = enforceMaxMovePerTrade(d(talent.current_price), rawNewPrice, talent.max_move_per_trade);
    rawNewPrice = enforceDailyLimit(rawNewPrice, talent.previous_close_price, talent.max_daily_move_percent);
    const newPrice = +clampPrice(rawNewPrice, talent).toFixed(4);

    const newBidAsk = calcBidAsk(newPrice, talent.spread);
    talent.current_price = D128(newPrice);
    talent.bid_price = D128(newBidAsk.bid);
    talent.ask_price = D128(newBidAsk.ask);
    talent.last_trade_at = new Date();
    await talent.save({ session });

    // Step 10 – Price history
    await TalentPriceHistory.create(
      [
        {
          talent_id: position.talent_id,
          price: D128(newPrice),
          bid_price: D128(newBidAsk.bid),
          ask_price: D128(newBidAsk.ask),
          volume: D128(closeAmount),
          source_type: "trade",
          source_trade_id: trade._id,
          recorded_at: new Date(),
        },
      ],
      { session }
    );

    return {
      trade,
      position,
      closure,
      wallet: wallet.toDisplay(),
      updated_quote: {
        current_price: newPrice,
        bid: newBidAsk.bid,
        ask: newBidAsk.ask,
      },
    };
  });
}

// ── Statistics / chart data ─────────────────────────────────────────
export async function getTalentChart(talentId, range) {
  const resolved = await resolveTalent(talentId);
  if (!resolved) throw new Error("Talent not found");
  talentId = resolved._id;

  const now = new Date();
  let start;

  switch (range) {
    case "1D":
      start = new Date(now - 24 * 60 * 60 * 1000);
      break;
    case "1W":
      start = new Date(now - 7 * 24 * 60 * 60 * 1000);
      break;
    case "1M":
      start = new Date(now - 30 * 24 * 60 * 60 * 1000);
      break;
    case "3M":
      start = new Date(now - 90 * 24 * 60 * 60 * 1000);
      break;
    case "1Y":
      start = new Date(now - 365 * 24 * 60 * 60 * 1000);
      break;
    case "5Y":
      start = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000);
      break;
    case "10Y":
      start = new Date(now - 10 * 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now - 24 * 60 * 60 * 1000);
  }

  const history = await TalentPriceHistory.find({
    talent_id: talentId,
    recorded_at: { $gte: start },
  })
    .sort({ recorded_at: 1 })
    .lean();

  return history.map((h) => ({
    price: parseFloat(h.price.toString()),
    bid_price: parseFloat(h.bid_price.toString()),
    ask_price: parseFloat(h.ask_price.toString()),
    volume: parseFloat(h.volume.toString()),
    recorded_at: h.recorded_at,
  }));
}

export async function getTalentStats(talentId) {
  const talent = await resolveTalent(talentId);
  if (!talent) throw new Error("Talent not found");
  talentId = talent._id;

  const now = new Date();
  const ranges = {
    "24h": new Date(now - 24 * 60 * 60 * 1000),
    "1w": new Date(now - 7 * 24 * 60 * 60 * 1000),
    "1m": new Date(now - 30 * 24 * 60 * 60 * 1000),
    "3m": new Date(now - 90 * 24 * 60 * 60 * 1000),
    "1y": new Date(now - 365 * 24 * 60 * 60 * 1000),
    "10y": new Date(now - 10 * 365 * 24 * 60 * 60 * 1000),
  };

  const currentPrice = d(talent.current_price);
  const stats = {};

  for (const [key, since] of Object.entries(ranges)) {
    const oldest = await TalentPriceHistory.findOne({
      talent_id: talentId,
      recorded_at: { $gte: since },
    })
      .sort({ recorded_at: 1 })
      .lean();

    const volumeAgg = await TalentPriceHistory.aggregate([
      {
        $match: {
          talent_id: new mongoose.Types.ObjectId(talentId),
          recorded_at: { $gte: since },
        },
      },
      { $group: { _id: null, total: { $sum: "$volume" } } },
    ]);

    const basePrice = oldest ? parseFloat(oldest.price.toString()) : currentPrice;
    const change = +(currentPrice - basePrice).toFixed(4);
    const changePct = basePrice > 0 ? +((change / basePrice) * 100).toFixed(2) : 0;
    const vol = volumeAgg[0] ? parseFloat(volumeAgg[0].total.toString()) : 0;

    stats[key] = {
      change_amount: change,
      change_percent: changePct,
      volume: vol,
    };
  }

  return {
    talent_id: talent._id,
    name: talent.name,
    symbol: talent.symbol,
    current_price: currentPrice,
    bid_price: d(talent.bid_price),
    ask_price: d(talent.ask_price),
    stats,
  };
}

// ── User P&L summaries ─────────────────────────────────────────────
export async function getUserPnlSummary(userId) {
  // Realized P&L: sum of all closed trades pnl
  const realizedAgg = await Trade.aggregate([
    {
      $match: {
        user_id: new mongoose.Types.ObjectId(userId),
        trade_type: "close",
        pnl: { $ne: null },
      },
    },
    { $group: { _id: null, total: { $sum: "$pnl" } } },
  ]);

  // Unrealized P&L: from open positions
  const openPositions = await Position.find({ user_id: userId, status: "open" }).lean();
  let unrealizedPnl = 0;

  for (const pos of openPositions) {
    const talent = await Talent.findById(pos.talent_id).lean();
    if (!talent) continue;

    const { bid, ask } = calcBidAsk(talent.current_price, talent.spread);
    const units = d(pos.units);
    const entryPrice = d(pos.entry_price);

    if (pos.side === "buy") {
      unrealizedPnl += (bid - entryPrice) * units;
    } else {
      unrealizedPnl += (entryPrice - ask) * units;
    }
  }

  return {
    realized_pnl: realizedAgg[0] ? +parseFloat(realizedAgg[0].total.toString()).toFixed(2) : 0,
    unrealized_pnl: +unrealizedPnl.toFixed(2),
    total_equity_pnl: +(
      (realizedAgg[0] ? parseFloat(realizedAgg[0].total.toString()) : 0) + unrealizedPnl
    ).toFixed(2),
    open_positions_count: openPositions.length,
  };
}
