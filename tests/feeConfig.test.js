import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateListingFee } from "../config/feeConfig.js";
import { getTransactionFee } from "../services/tradingService.js";

// ── calculateListingFee ──────────────────────────────────────────────

test("calculateListingFee: 3% of a large valuation exceeds the minimum", () => {
  // 3% of $100,000 = $3,000, well above the $500 floor
  assert.equal(calculateListingFee(100000), 3000);
});

test("calculateListingFee: small valuation floors at the $500 minimum", () => {
  // 3% of $1,000 = $30, floored up to $500
  assert.equal(calculateListingFee(1000), 500);
});

test("calculateListingFee: zero/negative valuation still floors at the minimum", () => {
  assert.equal(calculateListingFee(0), 500);
  assert.equal(calculateListingFee(-500), 500);
});

// ── getTransactionFee (90-day launch promo) ─────────────────────────

test("getTransactionFee: 0% fee within the 90-day promo window (graduated_at anchor)", () => {
  const talent = { graduated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }; // 10 days ago
  assert.equal(getTransactionFee(1000, talent), 0);
});

test("getTransactionFee: 1.5% fee once the 90-day promo window has passed", () => {
  const talent = { graduated_at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) }; // 91 days ago
  assert.equal(getTransactionFee(1000, talent), 15); // 1.5% of 1000
});

test("getTransactionFee: right at the boundary (exactly 90 days) is past the promo", () => {
  const talent = { graduated_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000 - 1000) }; // just over 90 days
  assert.equal(getTransactionFee(1000, talent), 15);
});

test("getTransactionFee: falls back to createdAt when graduated_at is unset (immediate qualifier, never futures-tier)", () => {
  const talent = { graduated_at: null, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) };
  assert.equal(getTransactionFee(1000, talent), 0);
});

test("getTransactionFee: no anchor date at all charges the standard rate (fail safe, not fail open)", () => {
  const talent = { graduated_at: null, createdAt: null };
  assert.equal(getTransactionFee(1000, talent), 15);
});
