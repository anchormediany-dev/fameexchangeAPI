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
import { appendLedgerEntry } from "./ledgerService.js";
import { recordRevenueEvent } from "./revenueTrackerService.js";
import { MARKET_MAKING } from "../config/marketMakingConfig.js";
import {
  TRANSACTION_FEE_PERCENT,
  LAUNCH_PROMO_DAYS,
  LAUNCH_PROMO_FEE_PERCENT,
} from "../config/feeConfig.js";

const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);
const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

// ── Fee config ──────────────────────────────────────────────────────
const QUOTE_EXPIRY_SECONDS = 10;

/**
 * 0% for LAUNCH_PROMO_DAYS from whichever date this talent actually became
 * tradeable (graduated_at if it was ever futures-tier, else createdAt),
 * TRANSACTION_FEE_PERCENT after that. Replaces the old flat FEE_RATE with
 * no promo window.
 */
function getTransactionFee(amount, talent) {
  const anchor = talent.graduated_at || talent.createdAt;
  const promoEndsAt = anchor
    ? new Date(new Date(anchor).getTime() + LAUNCH_PROMO_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const inPromo = promoEndsAt ? Date.now() < promoEndsAt.getTime() : false;
  const rate = inPromo ? LAUNCH_PROMO_FEE_PERCENT : TRANSACTION_FEE_PERCENT;
  return +(amount * rate).toFixed(2);
}

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

export {
  calcBidAsk,
  effectiveSpread,
  clampPrice,
  enforceMaxMovePerTrade,
  enforceDailyLimit,
  calcPoolBidAsk,
  calcPoolPriceImpact,
  getTransactionFee,
};

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

// ── Discrete-share liquidity pool pricing ──────────────────────────
// Real market-making off the talent's actual pool inventory. This replaced
// an earlier synthetic liquidity_factor/volatility_multiplier-based price-
// impact model (calcMarketImpact, removed — confirmed unused by any live
// call site once every talent reaching the trade path has a real share
// allocation). Falls back to the flat calcBidAsk above for a talent with no
// pool yet (shouldn't happen for anything reaching the live trade path, but
// this avoids a divide-by-zero rather than silently mispricing).

/**
 * Asymmetric bid/ask based on how depleted the liquidity pool is.
 * utilization: 0 = full pool (nothing bought yet), 1 = empty pool (nothing
 * left to sell to buyers). Spread widens from MARKET_MAKING.spreadPercent
 * (full pool) toward maxSpreadPercent (empty pool), and the quoted midpoint
 * skews upward as the pool depletes — discourages further buying (raises
 * the ask more) while still attracting sellers back into the pool (raises
 * the bid too, just less steeply).
 */
function calcPoolBidAsk(currentPrice, talent) {
  const p = d(currentPrice);
  const poolSize = Number(talent.shares_in_liquidity_pool) || 0;
  if (poolSize <= 0) return calcBidAsk(p, talent.spread);

  const poolAvailable = talent.shares_available_in_pool != null
    ? Number(talent.shares_available_in_pool)
    : poolSize;
  const utilization = 1 - Math.max(0, Math.min(1, poolAvailable / poolSize));

  const spreadPct = MARKET_MAKING.spreadPercent
    + (MARKET_MAKING.maxSpreadPercent - MARKET_MAKING.spreadPercent) * utilization;
  const halfSpread = (p * spreadPct) / 2;
  const skew = halfSpread * utilization;

  return {
    bid: +(p - halfSpread + skew * 0.5).toFixed(4),
    ask: +(p + halfSpread + skew).toFixed(4),
  };
}

/**
 * Price impact driven by real pool depth: what fraction of the liquidity
 * pool's total inventory this trade's units represent, rather than the old
 * synthetic amount/liquidity_factor divisor.
 */
function calcPoolPriceImpact(unitsTraded, talent) {
  const poolSize = Number(talent.shares_in_liquidity_pool) || 0;
  if (poolSize <= 0) return 0;
  const p = d(talent.current_price);
  const fractionOfPool = unitsTraded / poolSize;
  return +(p * fractionOfPool).toFixed(4);
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
  if (talent.tier === "futures") throw new Error("Talent is in the Futures tier and is not yet tradeable");

  const { bid, ask } = calcPoolBidAsk(talent.current_price, talent);
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
  if (talent.tier === "futures") throw new Error("Talent is in the Futures tier and is not yet tradeable");

  const { bid, ask } = calcPoolBidAsk(talent.current_price, talent);
  const entryPrice = side === "buy" ? ask : bid;
  // Whole shares only — this may buy slightly less than the requested
  // dollar amount; the actual amount charged is recomputed from the
  // floored share count, not the originally-requested amount.
  const units = Math.floor(amount / entryPrice);
  const actualAmount = +(units * entryPrice).toFixed(2);
  const fee = getTransactionFee(actualAmount, talent);
  const totalRequired = +(actualAmount + fee).toFixed(2);

  const poolAvailable = talent.shares_available_in_pool != null ? Number(talent.shares_available_in_pool) : null;
  const poolCanCover = poolAvailable == null || units <= poolAvailable;

  const wallet = await Wallet.findOne({ userId });
  const walletBalance = wallet ? d(wallet.available_balance) : 0;

  return {
    talent_id: talent._id,
    resolved_talent_id: talent._id,
    side,
    entry_price: entryPrice,
    estimated_units: units,
    requested_amount: amount,
    actual_amount: actualAmount,
    fee,
    total_required: totalRequired,
    wallet_balance: walletBalance,
    pool_available: poolAvailable,
    can_execute: units >= 1 && poolCanCover && walletBalance >= totalRequired,
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
    if (talent.tier === "futures") throw new Error("Talent is in the Futures tier and is not yet tradeable");
    talentId = talent._id;

    // Step 2 – Validate order size
    const minOrder = d(talent.min_order_amount);
    const maxOrder = d(talent.max_order_amount);
    if (amount < minOrder) throw new Error(`Minimum order amount is $${minOrder}`);
    if (amount > maxOrder) throw new Error(`Maximum order amount is $${maxOrder}`);

    // Step 3 – Current quote
    const { bid, ask } = calcPoolBidAsk(talent.current_price, talent);
    const entryPrice = side === "buy" ? ask : bid;

    // Step 4 – Quote slippage check (allow 1% slippage from quoted price)
    if (quotePrice) {
      const slippage = Math.abs(entryPrice - quotePrice) / quotePrice;
      if (slippage > 0.01) throw new Error("Price has moved significantly. Please refresh your quote.");
    }

    // Step 5 – Calc units (whole shares only) and pool availability. Both
    // "buy" and "sell" opens consume pool capacity here — a "sell" open is a
    // short position, which still requires borrowing available shares from
    // the pool, same as a real margin short.
    const units = Math.floor(amount / entryPrice);
    if (units < 1) throw new Error("Amount too small to buy even one share at the current price");

    const poolAvailable = Number(talent.shares_available_in_pool) || 0;
    if (units > poolAvailable) {
      throw new Error(`Not enough shares available in the liquidity pool (${poolAvailable} available, ${units} requested)`);
    }

    // Actual amount charged is recomputed from the floored share count —
    // may be slightly less than the originally-requested amount.
    const actualAmount = +(units * entryPrice).toFixed(2);
    const fee = getTransactionFee(actualAmount, talent);
    const totalRequired = +(actualAmount + fee).toFixed(2);

    // Step 6 – Wallet check
    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) throw new Error("Wallet not found. Please contact support.");
    const availBal = d(wallet.available_balance);
    if (availBal < totalRequired) throw new Error("Insufficient wallet balance");

    // Step 7 – Create position
    const [position] = await Position.create(
      [
        {
          user_id: userId,
          talent_id: talentId,
          side,
          entry_price: D128(entryPrice),
          current_price_snapshot: D128(d(talent.current_price)),
          units,
          invested_amount: D128(actualAmount),
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

    // Step 8b – Pool inventory: this order's shares move out of the pool
    // into circulation (buy) or are borrowed from the pool to open a short
    // (sell) — either way, pool availability drops by `units` until the
    // position closes.
    talent.shares_available_in_pool = poolAvailable - units;
    talent.shares_in_circulation = (Number(talent.shares_in_circulation) || 0) + units;

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
          units,
          amount: D128(actualAmount),
          fees: D128(fee),
          pnl: null,
          wallet_balance_after: D128(balanceAfter),
          idempotency_key: idempotencyKey || undefined,
        },
      ],
      { session }
    );

    // Step 10 – Wallet transaction log
    const [walletTransaction] = await WalletTransaction.create(
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

    // Step 11 – Update talent price (pool-depletion-based impact)
    const impact = calcPoolPriceImpact(units, talent);
    let rawNewPrice = d(talent.current_price) + (side === "buy" ? impact : -impact);
    rawNewPrice = enforceMaxMovePerTrade(d(talent.current_price), rawNewPrice, talent.max_move_per_trade);
    rawNewPrice = enforceDailyLimit(rawNewPrice, talent.previous_close_price, talent.max_daily_move_percent);
    const newPrice = +clampPrice(rawNewPrice, talent).toFixed(4);

    talent.current_price = D128(newPrice);
    const newBidAsk = calcPoolBidAsk(newPrice, talent);
    talent.bid_price = D128(newBidAsk.bid);
    talent.ask_price = D128(newBidAsk.ask);
    talent.last_trade_at = new Date();
    await talent.save({ session }); // also persists shares_available_in_pool/shares_in_circulation from step 8b

    // Step 12 – Price history
    const [priceHistoryEntry] = await TalentPriceHistory.create(
      [
        {
          talent_id: talentId,
          price: D128(newPrice),
          bid_price: D128(newBidAsk.bid),
          ask_price: D128(newBidAsk.ask),
          volume: D128(actualAmount),
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
          volume_24h: D128(actualAmount),
          ...(side === "buy"
            ? { net_buy_pressure: D128(actualAmount) }
            : { net_sell_pressure: D128(actualAmount) }),
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
      _ledger: { walletTransaction, priceHistoryEntry },
    };
  }).then(async (result) => {
    const { _ledger, ...publicResult } = result;
    // Chain AFTER the transaction has committed — a ledger entry must never
    // exist for a trade that didn't actually happen. Appends are serialized
    // in-process (see ledgerService) so this trio stays in strict order.
    await appendLedgerEntry("trade", result.trade._id, result.trade.toObject());
    await appendLedgerEntry(
      "wallet_transaction",
      _ledger.walletTransaction._id,
      _ledger.walletTransaction.toObject()
    );
    await appendLedgerEntry(
      "talent_price_history",
      _ledger.priceHistoryEntry._id,
      _ledger.priceHistoryEntry.toObject()
    );
    const feeAmount = d(result.trade.fees);
    if (feeAmount > 0) {
      await recordRevenueEvent({
        event_type: "transaction_fee",
        amount: feeAmount,
        talent_id: result.trade.talent_id,
        trade_id: result.trade._id,
        buyer_id: side === "buy" ? userId : null,
        seller_id: side === "sell" ? userId : null,
        notes: "trade_open",
      });
    }
    return publicResult;
  });
}

// ── Close preview ───────────────────────────────────────────────────
export async function closePreview(positionId, userId) {
  const position = await Position.findOne({ _id: positionId, user_id: userId });
  if (!position) throw new Error("Position not found");
  if (position.status !== "open") throw new Error("Position is already closed");

  const talent = await Talent.findById(position.talent_id);
  if (!talent) throw new Error("Talent not found");

  const { bid, ask } = calcPoolBidAsk(talent.current_price, talent);
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

  const fee = getTransactionFee(Math.abs(exitPrice * units), talent);
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
    const { bid, ask } = calcPoolBidAsk(talent.current_price, talent);
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

    const fee = getTransactionFee(Math.abs(exitPrice * units), talent);
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
          units,
          amount: D128(Math.abs(netSettlement)),
          fees: D128(fee),
          pnl: D128(pnl),
          wallet_balance_after: D128(Math.max(balanceAfter, 0)),
        },
      ],
      { session }
    );

    // Step 8 – Wallet transaction log
    const [walletTransaction] = await WalletTransaction.create(
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

    // Step 9 – Return shares to the pool. Closing a position (either side)
    // frees up the units it was holding out of the pool.
    const poolSize = Number(talent.shares_in_liquidity_pool) || 0;
    const poolAvailable = Number(talent.shares_available_in_pool) || 0;
    talent.shares_available_in_pool = poolSize > 0 ? Math.min(poolSize, poolAvailable + units) : poolAvailable + units;
    talent.shares_in_circulation = Math.max(0, (Number(talent.shares_in_circulation) || 0) - units);

    // Step 10 – Update talent price (closing order pressure, pool-depletion-based)
    const closeAmount = Math.abs(exitPrice * units);
    const impact = calcPoolPriceImpact(units, talent);

    // Closing a BUY = sell pressure; closing a SELL = buy pressure
    const priceDirection = position.side === "buy" ? -impact : impact;
    let rawNewPrice = d(talent.current_price) + priceDirection;
    rawNewPrice = enforceMaxMovePerTrade(d(talent.current_price), rawNewPrice, talent.max_move_per_trade);
    rawNewPrice = enforceDailyLimit(rawNewPrice, talent.previous_close_price, talent.max_daily_move_percent);
    const newPrice = +clampPrice(rawNewPrice, talent).toFixed(4);

    talent.current_price = D128(newPrice);
    const newBidAsk = calcPoolBidAsk(newPrice, talent);
    talent.bid_price = D128(newBidAsk.bid);
    talent.ask_price = D128(newBidAsk.ask);
    talent.last_trade_at = new Date();
    await talent.save({ session }); // also persists shares_available_in_pool/shares_in_circulation from step 9

    // Step 11 – Price history
    const [priceHistoryEntry] = await TalentPriceHistory.create(
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
      _ledger: { walletTransaction, priceHistoryEntry },
    };
  }).then(async (result) => {
    const { _ledger, ...publicResult } = result;
    await appendLedgerEntry("trade", result.trade._id, result.trade.toObject());
    await appendLedgerEntry(
      "wallet_transaction",
      _ledger.walletTransaction._id,
      _ledger.walletTransaction.toObject()
    );
    await appendLedgerEntry(
      "talent_price_history",
      _ledger.priceHistoryEntry._id,
      _ledger.priceHistoryEntry.toObject()
    );
    const feeAmount = d(result.trade.fees);
    if (feeAmount > 0) {
      await recordRevenueEvent({
        event_type: "transaction_fee",
        amount: feeAmount,
        talent_id: result.trade.talent_id,
        trade_id: result.trade._id,
        buyer_id: result.position.side === "sell" ? userId : null,
        seller_id: result.position.side === "buy" ? userId : null,
        notes: "trade_close",
      });
    }
    return publicResult;
  });
}

// ── Statistics / chart data ─────────────────────────────────────────

const RANGE_CONFIG = {
  "1D":  { ms: 24 * 60 * 60 * 1000,            bucketMs: 5 * 60 * 1000 },
  "1W":  { ms: 7 * 24 * 60 * 60 * 1000,        bucketMs: 60 * 60 * 1000 },
  "1M":  { ms: 30 * 24 * 60 * 60 * 1000,       bucketMs: 4 * 60 * 60 * 1000 },
  "3M":  { ms: 90 * 24 * 60 * 60 * 1000,       bucketMs: 12 * 60 * 60 * 1000 },
  "1Y":  { ms: 365 * 24 * 60 * 60 * 1000,      bucketMs: 24 * 60 * 60 * 1000 },
  "5Y":  { ms: 5 * 365 * 24 * 60 * 60 * 1000,  bucketMs: 7 * 24 * 60 * 60 * 1000 },
  "10Y": { ms: 10 * 365 * 24 * 60 * 60 * 1000, bucketMs: 30 * 24 * 60 * 60 * 1000 },
};

export async function getTalentChart(talentId, range, format = "ohlc") {
  const resolved = await resolveTalent(talentId);
  if (!resolved) throw new Error("Talent not found");
  talentId = resolved._id;

  const cfg = RANGE_CONFIG[range] || RANGE_CONFIG["1D"];
  const start = new Date(Date.now() - cfg.ms);

  if (format === "ohlc") {
    const candles = await TalentPriceHistory.aggregate([
      { $match: { talent_id: talentId, recorded_at: { $gte: start } } },
      { $sort: { recorded_at: 1 } },
      {
        $addFields: {
          priceNum: { $toDouble: "$price" },
          volumeNum: { $toDouble: "$volume" },
          bucketTs: {
            $subtract: [
              { $toLong: "$recorded_at" },
              { $mod: [{ $toLong: "$recorded_at" }, cfg.bucketMs] },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$bucketTs",
          open:   { $first: "$priceNum" },
          high:   { $max:   "$priceNum" },
          low:    { $min:   "$priceNum" },
          close:  { $last:  "$priceNum" },
          volume: { $sum:   "$volumeNum" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          // lightweight-charts expects Unix seconds (integer)
          time:   { $toInt: { $divide: ["$_id", 1000] } },
          open:   1,
          high:   1,
          low:    1,
          close:  1,
          volume: 1,
        },
      },
    ]);
    return candles;
  }

  // Legacy line format (kept for any other consumers)
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

    const { bid, ask } = calcPoolBidAsk(talent.current_price, talent);
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
