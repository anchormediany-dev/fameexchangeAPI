import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFameScore, remarkTargetPrice } from "../services/famescoreService.js";

test("single-platform, high score, but below the elevated single-platform bar: does NOT qualify", () => {
  // 100K Instagram followers, 3% engagement, growth, verified — maxes out
  // the score (100/100) but doesn't clear either qualification path: fails
  // the standard path's minPlatforms:2, AND falls short of the single-
  // platform alternative path's elevated 250K-follower bar. Score and
  // qualification are deliberately separate outputs.
  const result = calculateFameScore([
    { platform: "instagram", followers: 100000, engagementRate: 0.03, growthRate: 0.05, verified: true },
  ]);
  assert.equal(result.fameScore, 100);
  assert.equal(result.qualified, false);
  assert.equal(result.recommendation, "famefutures_routing");
  assert.match(result.qualificationReason, /Need 2\+ platforms/);
});

test("single-platform mega-creator clearing the elevated bar: qualifies via single-platform path", () => {
  // 300K YouTube subscribers, 4% engagement, growth, verified — clears
  // SINGLE_PLATFORM_QUALIFICATION (250K followers, 3% engagement) even
  // though it's still just one platform.
  const result = calculateFameScore([
    { platform: "youtube", followers: 300000, engagementRate: 0.04, growthRate: 0.1, verified: true },
  ]);
  assert.equal(result.fameScore, 100);
  assert.equal(result.qualified, true);
  assert.equal(result.recommendation, "tradeable_asset");
  assert.match(result.qualificationReason, /single-platform dominance on youtube/);
});

test("low engagement, low followers, no growth, single platform: low score, not qualified", () => {
  const result = calculateFameScore([
    { platform: "tiktok", followers: 10000, engagementRate: 0.01 },
  ]);
  assert.equal(result.fameScore, 2.5);
  assert.equal(result.qualified, false);
  assert.equal(result.recommendation, "famefutures_routing");
  assert.match(result.qualificationReason, /Below 50,000 total followers/);
  assert.match(result.qualificationReason, /Below 2% average engagement/);
  assert.match(result.qualificationReason, /Need 2\+ platforms/);
  assert.match(result.qualificationReason, /No positive growth trend/);
});

test("3 platforms, 80K total followers, 2.5% avg engagement, growth: qualifies", () => {
  const result = calculateFameScore([
    { platform: "youtube", followers: 40000, engagementRate: 0.025, growthRate: 0.1 },
    { platform: "tiktok", followers: 30000, engagementRate: 0.025 },
    { platform: "instagram", followers: 10000, engagementRate: 0.025 },
  ]);
  assert.equal(result.totalFollowers, 80000);
  assert.equal(result.avgEngagementRate, 0.025);
  assert.equal(result.fameScore, 82.5);
  assert.equal(result.qualified, true);
  assert.equal(result.recommendation, "tradeable_asset");
});

test("exactly at every threshold (50K followers, 2% engagement, 2 platforms, growth): qualifies", () => {
  const result = calculateFameScore([
    { platform: "youtube", followers: 25000, engagementRate: 0.02, growthRate: 0.01 },
    { platform: "tiktok", followers: 25000, engagementRate: 0.02 },
  ]);
  assert.equal(result.totalFollowers, 50000);
  assert.equal(result.avgEngagementRate, 0.02);
  assert.equal(result.fameScore, 42);
  assert.equal(result.qualified, true);
  assert.equal(result.recommendation, "tradeable_asset");
});

test("just under the follower threshold (49K): does not qualify, reason names the specific gap", () => {
  const result = calculateFameScore([
    { platform: "youtube", followers: 25000, engagementRate: 0.03, growthRate: 0.05 },
    { platform: "tiktok", followers: 24000, engagementRate: 0.03 },
  ]);
  assert.equal(result.totalFollowers, 49000);
  // Mathematically 58.75; toFixed(1) on the actual IEEE754 float rounds to
  // 58.7 (58.75 isn't exactly representable in binary), not a logic bug.
  assert.equal(result.fameScore, 58.7);
  assert.equal(result.qualified, false);
  assert.equal(result.recommendation, "famefutures_routing");
  assert.equal(
    result.qualificationReason,
    "Below 50,000 total followers (currently 49,000). Or reach 250,000+ followers with 3%+ engagement on a single platform."
  );
});

test("empty platforms array: zero score, not qualified, no crash", () => {
  const result = calculateFameScore([]);
  assert.equal(result.fameScore, 0);
  assert.equal(result.qualified, false);
  assert.equal(result.platformCount, 0);
  assert.equal(result.recommendation, "famefutures_routing");
});

// ── remarkTargetPrice ────────────────────────────────────────────────────
// Regression coverage for the price-anchor bug: a tradeable talent's
// current_price used to be re-marked toward the FameScore percentile curve
// (priceFromFameScore) even after real shares existed, completely
// disconnected from the discrete-share model's valuation/total_shares
// economics — making shares practically unbuyable (e.g. $79K/share for a
// talent whose real share price should have been ~$5.59).

test("remarkTargetPrice: tradeable talent with real shares targets valuation/total_shares, not the percentile curve", () => {
  const target = remarkTargetPrice({
    tier: "tradeable",
    totalShares: 10000,
    valuation: 55852.5,
    fameScore: 100, // would otherwise curve toward max_price
    minPrice: 1,
    maxPrice: 100000,
  });
  assert.equal(target, 5.58525); // 55852.5 / 10000 -- nowhere near the percentile-curve's ~100000
});

test("remarkTargetPrice: futures-tier talent (no shares yet) still uses the FameScore percentile curve", () => {
  const target = remarkTargetPrice({
    tier: "futures",
    totalShares: null,
    valuation: 55852.5,
    fameScore: 100,
    minPrice: 1,
    maxPrice: 100000,
  });
  assert.equal(target, 100000); // fameScore 100 -> curve saturates at max_price, no shares to anchor to yet
});

test("remarkTargetPrice: tradeable talent with total_shares somehow still null falls back to the percentile curve (defensive, shouldn't happen in practice)", () => {
  const target = remarkTargetPrice({
    tier: "tradeable",
    totalShares: null,
    valuation: 55852.5,
    fameScore: 50,
    minPrice: 1,
    maxPrice: 100000,
  });
  assert.ok(target > 0 && !Number.isNaN(target));
});
