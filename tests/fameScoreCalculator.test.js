import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFameScore, remarkTargetPrice, platformGrowthQualifies } from "../services/famescoreService.js";

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
  assert.match(result.qualificationReason, /No qualifying growth trend/);
});

test("3 platforms, 80K total followers, 2.5% avg engagement, growth: qualifies", () => {
  // v3 recompute (growth is now a per-platform value multiplier, not a flat
  // score bonus): youtube subscriberValue = 40000*0.025*22.5 = 22500;
  // growthRate 0.1 lands in the "growing" tier (<=0.1) -> x1.05 = 23625.
  // tiktok = 30000*0.025*12.5 = 9375 (no growth signal -> x1.0, unchanged).
  // instagram = 10000*0.025*17.5 = 4375 (no growth signal -> x1.0, unchanged).
  // total = 23625+9375+4375 = 37375 -> score = 37375/50000*100 = 74.75.
  // +MULTI_PLATFORM_BONUS_3PLUS(5) = 79.75 -> toFixed(1) = 79.8.
  const result = calculateFameScore([
    { platform: "youtube", followers: 40000, engagementRate: 0.025, growthRate: 0.1 },
    { platform: "tiktok", followers: 30000, engagementRate: 0.025 },
    { platform: "instagram", followers: 10000, engagementRate: 0.025 },
  ]);
  assert.equal(result.totalFollowers, 80000);
  assert.equal(result.avgEngagementRate, 0.025);
  assert.equal(result.fameScore, 79.8);
  assert.equal(result.qualified, true);
  assert.equal(result.recommendation, "tradeable_asset");
});

test("exactly at every threshold (50K followers, 2% engagement, 2 platforms, growth): qualifies", () => {
  // v3 recompute: youtube subscriberValue = 25000*0.02*22.5 = 11250;
  // growthRate 0.01 lands exactly on the "flat" tier's boundary (<=0.01)
  // -> x1.0 (no boost), unlike the old flat +5 GROWTH_BONUS this used to
  // trigger. tiktok = 25000*0.02*12.5 = 6250 (no growth signal -> x1.0).
  // total = 11250+6250 = 17500 -> score = 17500/50000*100 = 35.
  // +MULTI_PLATFORM_BONUS_2(2) = 37.
  const result = calculateFameScore([
    { platform: "youtube", followers: 25000, engagementRate: 0.02, growthRate: 0.01 },
    { platform: "tiktok", followers: 25000, engagementRate: 0.02 },
  ]);
  assert.equal(result.totalFollowers, 50000);
  assert.equal(result.avgEngagementRate, 0.02);
  assert.equal(result.fameScore, 37);
  assert.equal(result.qualified, true);
  assert.equal(result.recommendation, "tradeable_asset");
});

test("just under the follower threshold (49K): does not qualify, reason names the specific gap", () => {
  // v3 recompute: youtube subscriberValue = 25000*0.03*22.5 = 16875;
  // growthRate 0.05 lands in the "growing" tier (<=0.1) -> x1.05 = 17718.75.
  // tiktok = 24000*0.03*12.5 = 9000 (no growth signal -> x1.0).
  // total = 17718.75+9000 = 26718.75 -> score = 26718.75/50000*100 = 53.4375.
  // +MULTI_PLATFORM_BONUS_2(2) = 55.4375 -> toFixed(1) = 55.4.
  const result = calculateFameScore([
    { platform: "youtube", followers: 25000, engagementRate: 0.03, growthRate: 0.05 },
    { platform: "tiktok", followers: 24000, engagementRate: 0.03 },
  ]);
  assert.equal(result.totalFollowers, 49000);
  assert.equal(result.fameScore, 55.4);
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

// ── platformGrowthQualifies (v3 growth-tiering) ─────────────────────────
// Regression coverage for the real production bug: a 237M-follower account
// was blocked from qualifying because its ~0% growth (normal at that scale)
// was treated identically to a dead account under the old flat
// "growthRate > 0" rule. The bar now scales with account maturity/size.

test("mature account, mild decline within the -5% floor: growth qualifies", () => {
  // THE CORE REGRESSION TEST for the reported bug's mechanism.
  const result = platformGrowthQualifies({ followers: 500000, growthRate: -0.03, accountAgeMonths: 24 });
  assert.equal(result, true);
});

test("mature account, decline beyond the -5% floor: growth does not qualify", () => {
  const result = platformGrowthQualifies({ followers: 500000, growthRate: -0.08, accountAgeMonths: 24 });
  assert.equal(result, false);
});

test("new account (<6 months) with barely-positive growth below the +1% floor: does not qualify", () => {
  const result = platformGrowthQualifies({ followers: 100000, growthRate: 0.005, accountAgeMonths: 3 });
  assert.equal(result, false);
});

test("new account (<6 months) with real (+1%+) growth: qualifies", () => {
  const result = platformGrowthQualifies({ followers: 100000, growthRate: 0.02, accountAgeMonths: 3 });
  assert.equal(result, true);
});

test("mega account (2M+), % growth below the mature floor but 500K+/month absolute growth: qualifies via the absolute-delta OR path", () => {
  const result = platformGrowthQualifies({
    followers: 5000000,
    growthRate: -0.06, // below MATURE_ACCOUNT_GROWTH_FLOOR
    accountAgeMonths: null,
    absoluteFollowerDelta: 600000, // above MEGA_ACCOUNT_ABSOLUTE_GROWTH_FLOOR
  });
  assert.equal(result, true);
});

test("mega account (2M+), both % growth and absolute growth below their floors: does not qualify", () => {
  const result = platformGrowthQualifies({
    followers: 5000000,
    growthRate: -0.08,
    accountAgeMonths: null,
    absoluteFollowerDelta: 400000,
  });
  assert.equal(result, false);
});

test("unknown account age, non-mega platform: falls back to mature-account rules, not blocked for missing age data", () => {
  const result = platformGrowthQualifies({ followers: 300000, growthRate: -0.02, accountAgeMonths: null });
  assert.equal(result, true); // -0.02 >= MATURE_ACCOUNT_GROWTH_FLOOR(-0.05)
});

test("no snapshot history yet, non-mega account: still does NOT qualify via growth (anti-fraud protection preserved for smaller/newer accounts)", () => {
  const result = platformGrowthQualifies({ followers: 500000, growthRate: null, accountAgeMonths: null });
  assert.equal(result, false);
});

test("no snapshot history yet, mega-scale account (2M+): DOES qualify via growth on first-ever evaluation -- scale alone is proof enough", () => {
  // Real production case this fixes: a 274M-follower creator's very first
  // evaluation was blocked for a full 30 days by the no-first-evaluation
  // rule, even though the mega-account exception already covered the
  // "percentage growth too small at scale" problem once history existed.
  const result = platformGrowthQualifies({ followers: 274000000, growthRate: null, accountAgeMonths: null });
  assert.equal(result, true);
});

test("THE REPORTED BUG: a 237M-follower Instagram account with ~0% growth now qualifies via the single-platform path (previously blocked identically to a dead account)", () => {
  const result = calculateFameScore([
    { platform: "instagram", followers: 237_000_000, engagementRate: 0.03, growthRate: -0.01, accountAgeMonths: null, verified: true },
  ]);
  // Mega-scale (>=2M), -1% growth clears the -5% mature floor -> growth
  // qualifies. Trivially clears SINGLE_PLATFORM_QUALIFICATION's 250K/3% bar
  // at this scale, so the single-platform path is what actually qualifies it
  // (still only 1 platform, so the multi-platform path's minPlatforms:2 miss
  // still applies independently -- these two paths are evaluated separately).
  assert.equal(result.qualified, true);
  assert.match(result.qualificationReason, /single-platform dominance on instagram/);
});

test("THE REAL PRODUCTION CASE: 274M-follower Instagram account on its very first-ever evaluation (no snapshot history at all) now qualifies immediately", () => {
  // Mirrors the real dev-DB record: 2 platforms (twitter negligible,
  // instagram dominant), zero snapshot history yet on either. Instagram's
  // mega-scale first-evaluation exception alone makes hasGrowth true, which
  // clears the standard multi-platform path outright (2 platforms, well
  // over the follower/engagement minimums) -- doesn't even need the
  // single-platform path here.
  const result = calculateFameScore([
    { platform: "twitter", followers: 1, engagementRate: 0.02, growthRate: null, accountAgeMonths: null, verified: false },
    { platform: "instagram", followers: 274_000_000, engagementRate: 0.03, growthRate: null, accountAgeMonths: null, verified: false },
  ]);
  assert.equal(result.qualified, true);
  assert.equal(result.qualificationReason, "Meets all qualification thresholds for tradeable asset listing");
});

test("YouTube: totalViews/videoCount push value above the subscriber-only calculation via max()", () => {
  // subscriberValue = 5000*0.01*22.5 = 1125.
  // avgMonthlyViews = 50,000,000/24 = 2,083,333.33.
  // viewsValue = (2,083,333.33/1000)*13 = 27,083.33 -- wins the max().
  const withViews = calculateFameScore([
    { platform: "youtube", followers: 5000, engagementRate: 0.01, totalViews: 50_000_000, videoCount: 400, accountAgeMonths: 24 },
  ]);
  const withoutViews = calculateFameScore([
    { platform: "youtube", followers: 5000, engagementRate: 0.01, accountAgeMonths: 24 },
  ]);
  assert.equal(withViews.platformBreakdown[0].value, 27083.33);
  assert.equal(withoutViews.platformBreakdown[0].value, 1125);
  assert.ok(withViews.fameScore > withoutViews.fameScore);
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
