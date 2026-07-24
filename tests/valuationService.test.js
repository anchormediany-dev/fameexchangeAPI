import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTalentValuation } from "../services/valuationService.js";

// ── Regression test tying back to the original bug report ──────────────────

test("Hayley Him regression: 199K Instagram followers, 3% engagement, unverified, no growth history, fameScore 100 -> $100,296 notional valuation, NOT ~$104K/month", () => {
  const result = computeTalentValuation(
    [{ platform: "instagram", followers: 199000, engagementRate: 0.03, verified: false, growthRate: null }],
    100
  );
  // mmp = (199000/1000) * 17.5 (instagram midpoint) * 1.0 (engagementFactor at baseline) = 3482.5
  assert.equal(result.mmp, 3482.5);
  // amv = 3482.5 * 12 = 41790
  assert.equal(result.amv, 41790);
  // no growth signal -> flat multiplier 1.0
  assert.equal(result.growthRate, null);
  assert.equal(result.growthMultiplier, 1.0);
  // 1 platform -> 0.8 premium: 41790 * 0.8 = 33432
  assert.equal(result.amvFinal, 33432);
  // fameScore 100 -> 3.0x multiple: 33432 * 3.0 = 100296
  assert.equal(result.valuationMultiple, 3.0);
  assert.equal(result.valuation, 100296);
});

// ── Phase A/B: engagement factor scaling ────────────────────────────────────

test("engagement factor at baseline (3%) is 1.0x, doubling engagement roughly doubles mmp within the clamp", () => {
  const baseline = computeTalentValuation(
    [{ platform: "youtube", followers: 100000, engagementRate: 0.03, verified: false, growthRate: null }],
    50
  );
  const doubled = computeTalentValuation(
    [{ platform: "youtube", followers: 100000, engagementRate: 0.06, verified: false, growthRate: null }],
    50
  );
  assert.equal(baseline.perPlatform[0].engagementFactor, 1.0);
  assert.equal(doubled.perPlatform[0].engagementFactor, 2.0);
  assert.equal(doubled.mmp, baseline.mmp * 2);
});

test("engagement factor clamps at 0.5 minimum (very low engagement) and 3.0 maximum (very high engagement)", () => {
  const low = computeTalentValuation(
    [{ platform: "youtube", followers: 100000, engagementRate: 0.001, verified: false, growthRate: null }],
    50
  );
  const high = computeTalentValuation(
    [{ platform: "youtube", followers: 100000, engagementRate: 0.5, verified: false, growthRate: null }],
    50
  );
  assert.equal(low.perPlatform[0].engagementFactor, 0.5);
  assert.equal(high.perPlatform[0].engagementFactor, 3.0);
});

// ── Phase C: growth multiplier boundaries ───────────────────────────────────

test("growth multiplier: exactly at each boundary", () => {
  const cases = [
    [-0.5, 0.7],   // well below -0.05
    [-0.05, 1.0],  // exactly at boundary, included in flat band
    [0.05, 1.0],   // exactly at boundary, included in flat band
    [0.2, 1.3],    // exactly at boundary, included in growing band
    [0.5, 1.6],    // exactly at boundary, included in high-growth band
    [0.51, 2.0],   // just past 0.5, viral
  ];
  for (const [rate, expectedMultiplier] of cases) {
    const result = computeTalentValuation(
      [{ platform: "youtube", followers: 100000, engagementRate: 0.03, verified: false, growthRate: rate }],
      50
    );
    assert.equal(result.growthMultiplier, expectedMultiplier, `growthRate=${rate}`);
  }
});

test("growth rate: follower-weighted average across platforms with known growth, nulls excluded (not treated as 0%)", () => {
  const result = computeTalentValuation(
    [
      { platform: "youtube", followers: 80000, engagementRate: 0.03, verified: false, growthRate: 0.1 },
      { platform: "tiktok", followers: 20000, engagementRate: 0.03, verified: false, growthRate: null }, // excluded from average entirely
    ],
    50
  );
  // Only youtube has a known growth rate, so the aggregate is exactly 0.1,
  // not (0.1*80000 + 0*20000)/100000 = 0.08 (which would wrongly treat the
  // null platform as 0% growth).
  assert.equal(result.growthRate, 0.1);
  assert.equal(result.growthMultiplier, 1.3);
});

test("no platform has a known growth rate: aggregate is null, multiplier flat", () => {
  const result = computeTalentValuation(
    [{ platform: "youtube", followers: 100000, engagementRate: 0.03, verified: false, growthRate: null }],
    50
  );
  assert.equal(result.growthRate, null);
  assert.equal(result.growthMultiplier, 1.0);
});

// ── Phase D: cross-platform premium ─────────────────────────────────────────

test("cross-platform premium by platform count", () => {
  const platformOf = (n) =>
    Array.from({ length: n }, (_, i) => ({
      platform: ["youtube", "tiktok", "instagram", "twitter", "spotify"][i],
      followers: 20000,
      engagementRate: 0.03,
      verified: false,
      growthRate: null,
    }));
  const expected = { 0: 0.8, 1: 0.8, 2: 1.0, 3: 1.15, 4: 1.25, 5: 1.35 };
  for (const [count, premium] of Object.entries(expected)) {
    const n = Number(count);
    const result = computeTalentValuation(n === 0 ? [] : platformOf(n), 50);
    assert.equal(result.crossPlatformPremium, premium, `platformCount=${n}`);
  }
});

// ── Phase E: verified bonus (highest tier wins, not stacked) ────────────────

test("verified bonus: 0 verified -> 1.0x, 1-2 verified -> 1.1x, 3+ verified -> 1.2x (not stacked)", () => {
  const withVerifiedCount = (verifiedCount, total) =>
    Array.from({ length: total }, (_, i) => ({
      platform: ["youtube", "tiktok", "instagram", "twitter", "spotify"][i],
      followers: 20000,
      engagementRate: 0.03,
      verified: i < verifiedCount,
      growthRate: null,
    }));

  assert.equal(computeTalentValuation(withVerifiedCount(0, 3), 50).verifiedBonus, 1.0);
  assert.equal(computeTalentValuation(withVerifiedCount(1, 3), 50).verifiedBonus, 1.1);
  assert.equal(computeTalentValuation(withVerifiedCount(2, 3), 50).verifiedBonus, 1.1);
  assert.equal(computeTalentValuation(withVerifiedCount(3, 3), 50).verifiedBonus, 1.2);
});

// ── Phase F: valuation multiple by FameScore tier ───────────────────────────

test("valuation multiple: exactly at each FameScore tier boundary", () => {
  const cases = [
    [100, 3.0],
    [90, 3.0],
    [89, 2.5],
    [75, 2.5],
    [74, 2.0],
    [60, 2.0],
    [59, 1.5],
    [50, 1.5],
    [49, 1.0],
    [40, 1.0],
    [39, 0.5], // below the lowest qualifying tier -- still a meaningful, discounted value, not zero
    [0, 0.5],
  ];
  const platforms = [{ platform: "youtube", followers: 100000, engagementRate: 0.03, verified: false, growthRate: null }];
  for (const [fameScore, expectedMultiple] of cases) {
    const result = computeTalentValuation(platforms, fameScore);
    assert.equal(result.valuationMultiple, expectedMultiple, `fameScore=${fameScore}`);
  }
});

// ── Edge cases ───────────────────────────────────────────────────────────────

test("empty platforms array: zero valuation, no crash", () => {
  const result = computeTalentValuation([], 0);
  assert.equal(result.mmp, 0);
  assert.equal(result.valuation, 0);
  assert.equal(result.platformCount, 0);
  assert.equal(result.growthRate, null);
});

test("negative/zero followers and engagement floor to zero, no crash, no NaN", () => {
  const result = computeTalentValuation(
    [{ platform: "youtube", followers: -100, engagementRate: -0.5, verified: false, growthRate: null }],
    50
  );
  assert.equal(result.mmp, 0);
  assert.equal(result.valuation, 0);
  assert.ok(!Number.isNaN(result.valuation));
});
