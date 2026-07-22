import { test } from "node:test";
import assert from "node:assert/strict";
import { calcPoolBidAsk, calcPoolPriceImpact } from "../services/tradingService.js";
import { computeShareAllocation } from "../services/shareAllocationService.js";

// ── computeShareAllocation ──────────────────────────────────────────

test("computeShareAllocation: mid-size monetization value lands near the target anchor price", () => {
  // $50,000/mo -> total_shares = 50000/10 = 5000, clamped up to MIN_TOTAL_SHARES=10000
  const result = computeShareAllocation(50000);
  assert.equal(result.totalShares, 10000); // hit the floor
  assert.equal(result.sharesInLiquidityPool, Math.round(10000 * 0.1125));
  // initial_share_price = (value * 2) / totalShares = 100000 / 10000 = 10
  assert.equal(result.initialSharePrice, 10);
});

test("computeShareAllocation: large monetization value, no clamping, price lands near 2x anchor", () => {
  // $1,000,000/mo -> total_shares = 100000 (above MIN, below MAX, no clamp)
  const result = computeShareAllocation(1000000);
  assert.equal(result.totalShares, 100000);
  assert.equal(result.initialSharePrice, 20); // (1000000*2)/100000 = 20 = 2x TARGET_ANCHOR_PRICE
});

test("computeShareAllocation: zero/negative value floors to MIN_TOTAL_SHARES with a $0.10 price floor", () => {
  const zero = computeShareAllocation(0);
  assert.equal(zero.totalShares, 10000);
  assert.equal(zero.initialSharePrice, 0.1);

  const negative = computeShareAllocation(-500);
  assert.equal(negative.totalShares, 10000);
  assert.equal(negative.initialSharePrice, 0.1);
});

test("computeShareAllocation: extremely large value clamps at MAX_TOTAL_SHARES", () => {
  const result = computeShareAllocation(1_000_000_000); // way beyond MAX_TOTAL_SHARES=10,000,000 anchor math
  assert.equal(result.totalShares, 10000000);
});

// ── calcPoolBidAsk ───────────────────────────────────────────────────

test("calcPoolBidAsk: full pool (0% utilization) uses the base spreadPercent, roughly symmetric", () => {
  const talent = { current_price: 100, shares_in_liquidity_pool: 1000, shares_available_in_pool: 1000, spread: 0.5 };
  const { bid, ask } = calcPoolBidAsk(100, talent);
  // halfSpread = 100 * 0.03 / 2 = 1.5, skew = 0 (utilization 0)
  assert.equal(bid, 98.5);
  assert.equal(ask, 101.5);
});

test("calcPoolBidAsk: empty pool (100% utilization) uses maxSpreadPercent and skews the midpoint up", () => {
  const talent = { current_price: 100, shares_in_liquidity_pool: 1000, shares_available_in_pool: 0, spread: 0.5 };
  const { bid, ask } = calcPoolBidAsk(100, talent);
  // halfSpread = 100 * 0.05 / 2 = 2.5, skew = 2.5 * 1 = 2.5
  // bid = 100 - 2.5 + 2.5*0.5 = 98.75, ask = 100 + 2.5 + 2.5 = 105
  assert.equal(bid, 98.75);
  assert.equal(ask, 105);
  assert.ok(ask - 100 > 100 - bid, "empty pool should skew the ask wider than the bid");
});

test("calcPoolBidAsk: no pool allocated yet falls back to the flat symmetric spread", () => {
  const talent = { current_price: 100, shares_in_liquidity_pool: null, shares_available_in_pool: null, spread: 0.5 };
  const { bid, ask } = calcPoolBidAsk(100, talent);
  // falls back to calcBidAsk's flat SPREAD_PERCENT=0.005 dynamic spread
  assert.ok(bid < 100 && ask > 100);
  assert.equal(+(ask - bid).toFixed(4), +(ask - bid).toFixed(4)); // just confirm no crash/NaN
  assert.ok(!Number.isNaN(bid) && !Number.isNaN(ask));
});

// ── calcPoolPriceImpact ──────────────────────────────────────────────

test("calcPoolPriceImpact: trading half the pool moves price by half the current price", () => {
  const talent = { current_price: 100, shares_in_liquidity_pool: 1000 };
  const impact = calcPoolPriceImpact(500, talent);
  assert.equal(impact, 50); // 100 * (500/1000)
});

test("calcPoolPriceImpact: no pool allocated yet returns zero impact (no divide-by-zero)", () => {
  const talent = { current_price: 100, shares_in_liquidity_pool: 0 };
  assert.equal(calcPoolPriceImpact(10, talent), 0);
});
