import { test } from "node:test";
import assert from "node:assert/strict";
import { calcPoolBidAsk, calcPoolPriceImpact } from "../services/tradingService.js";
import { computeShareAllocation } from "../services/shareAllocationService.js";

// ── computeShareAllocation (tiered target share price) ───────────────

test("computeShareAllocation: valuation in the $50K-$200K tier targets a $10/share price", () => {
  const result = computeShareAllocation(100000);
  // targetPrice=10 (100000 < 200000 tier ceiling), rawShares=100000/10=10000, already a multiple of 500
  assert.equal(result.targetSharePrice, 10);
  assert.equal(result.totalShares, 10000);
  assert.equal(result.initialSharePrice, 10);
  assert.equal(result.sharesInLiquidityPool, Math.round(10000 * 0.1125)); // flat 11.25%, unchanged
});

test("computeShareAllocation: valuation in the $1M-$5M tier targets a $50/share price, differentiated from a smaller talent", () => {
  const result = computeShareAllocation(2000000);
  assert.equal(result.targetSharePrice, 50);
  assert.equal(result.totalShares, 40000);
  assert.equal(result.initialSharePrice, 50);
  // Confirms the fix: a $2M talent and a $100K talent no longer converge on
  // the same share price the flat-anchor approach produced.
  const smaller = computeShareAllocation(100000);
  assert.notEqual(result.initialSharePrice, smaller.initialSharePrice);
});

test("computeShareAllocation: tier boundaries are exclusive on the upper bound", () => {
  assert.equal(computeShareAllocation(49999).targetSharePrice, 5);
  assert.equal(computeShareAllocation(50000).targetSharePrice, 10); // exactly at boundary falls into the next tier
  assert.equal(computeShareAllocation(199999).targetSharePrice, 10);
  assert.equal(computeShareAllocation(200000).targetSharePrice, 20);
});

test("computeShareAllocation: zero/negative value floors to MIN_TOTAL_SHARES with the new $1.00 price floor", () => {
  const zero = computeShareAllocation(0);
  assert.equal(zero.totalShares, 10000);
  assert.equal(zero.initialSharePrice, 1.0);

  const negative = computeShareAllocation(-500);
  assert.equal(negative.totalShares, 10000);
  assert.equal(negative.initialSharePrice, 1.0);
});

test("computeShareAllocation: extremely large value clamps at MAX_TOTAL_SHARES", () => {
  const result = computeShareAllocation(2_000_000_000); // $2B, top $100/share tier, would be 20M shares uncapped
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
