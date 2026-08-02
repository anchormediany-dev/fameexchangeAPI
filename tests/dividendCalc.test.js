import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDividendDistribution } from "../services/dividendService.js";

test("computeDividendDistribution: single staker gets the entire pool", () => {
  const result = computeDividendDistribution(1000, [{ shares_staked: 100, multiplier: 1.0 }]);
  // totalWeightedShares = 100*1.0 = 100; dividendPerWeightedShare = 1000/100 = 10
  assert.equal(result.dividendPerWeightedShare, 10);
  assert.equal(result.payouts[0].base_dividend, 1000); // 100 * 10
  assert.equal(result.payouts[0].multiplied_dividend, 1000); // 1.0x, no change
});

test("computeDividendDistribution: multiplier tie-break — same shares, different multipliers, higher multiplier gets proportionally more", () => {
  // Two stakers with IDENTICAL share counts but different lock multipliers.
  const result = computeDividendDistribution(1000, [
    { shares_staked: 100, multiplier: 1.0 }, // 30-day lock
    { shares_staked: 100, multiplier: 2.0 }, // 365-day lock
  ]);
  // totalWeightedShares = 100*1.0 + 100*2.0 = 300; dividendPerWeightedShare = 1000/300 = 3.3333...
  const perWeighted = 1000 / 300;
  assert.equal(result.dividendPerWeightedShare, perWeighted);

  const [shortLock, longLock] = result.payouts;
  // base_dividend is the SAME for both (same raw shares_staked) ...
  assert.equal(shortLock.base_dividend, +(100 * perWeighted).toFixed(2));
  assert.equal(longLock.base_dividend, +(100 * perWeighted).toFixed(2));
  // ... but multiplied_dividend is exactly double for the 2.0x staker.
  assert.equal(longLock.multiplied_dividend, +(shortLock.multiplied_dividend * 2).toFixed(2));
});

test("computeDividendDistribution: three stakers, weighted shares split proportionally to shares_staked x multiplier", () => {
  const result = computeDividendDistribution(600, [
    { shares_staked: 100, multiplier: 1.0 }, // weighted 100
    { shares_staked: 50, multiplier: 2.0 },  // weighted 100
    { shares_staked: 200, multiplier: 1.0 }, // weighted 200
  ]);
  // totalWeightedShares = 100+100+200 = 400; dividendPerWeightedShare = 600/400 = 1.5
  assert.equal(result.dividendPerWeightedShare, 1.5);
  // Staker 1 and 2 have equal weighted shares (100 each) -> equal multiplied_dividend
  assert.equal(result.payouts[0].multiplied_dividend, result.payouts[1].multiplied_dividend);
  // Staker 3 has double the weighted shares of staker 1 -> double the payout
  assert.equal(result.payouts[2].multiplied_dividend, result.payouts[0].multiplied_dividend * 2);
  // Total distributed equals the pool (no rounding drift beyond cents)
  const total = result.payouts.reduce((sum, p) => sum + p.multiplied_dividend, 0);
  assert.ok(Math.abs(total - 600) < 0.01);
});

test("computeDividendDistribution: returns null when there are no weighted shares at all (e.g. empty stakes array)", () => {
  assert.equal(computeDividendDistribution(1000, []), null);
});

test("computeDividendDistribution: returns null when every stake has a zero share count", () => {
  assert.equal(computeDividendDistribution(1000, [{ shares_staked: 0, multiplier: 2.0 }]), null);
});
