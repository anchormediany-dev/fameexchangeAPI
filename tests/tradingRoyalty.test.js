import { test } from "node:test";
import assert from "node:assert/strict";
import { getTransactionFee, getTradingRoyalty } from "../services/tradingService.js";
import { TRANSACTION_FEE_PERCENT, TRADING_ROYALTY_PERCENT } from "../config/feeConfig.js";

// getTradingRoyalty must waive during the exact same promo window as
// getTransactionFee (both share the same isInPromoWindow() check) — a
// talent's launch promo shouldn't make trading more expensive via a new
// royalty while waiving the platform's own fee.

test("getTradingRoyalty: 0 during the 90-day promo window (fresh talent)", () => {
  const talent = { graduated_at: new Date(), createdAt: new Date() };
  const royalty = getTradingRoyalty(10000, talent);
  const fee = getTransactionFee(10000, talent);
  assert.equal(royalty, 0);
  assert.equal(fee, 0); // confirms both waive together
});

test("getTradingRoyalty: 0.5% after the promo window has passed", () => {
  const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000); // 200 days ago
  const talent = { graduated_at: longAgo, createdAt: longAgo };
  const royalty = getTradingRoyalty(10000, talent);
  const fee = getTransactionFee(10000, talent);
  assert.equal(royalty, +(10000 * TRADING_ROYALTY_PERCENT).toFixed(2)); // 50
  assert.equal(fee, +(10000 * TRANSACTION_FEE_PERCENT).toFixed(2)); // 150
});

test("getTradingRoyalty and getTransactionFee flip from waived to charged on the exact same day", () => {
  // 91 days ago -> just past the 90-day window for both
  const justPast = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
  const talent = { graduated_at: justPast, createdAt: justPast };
  assert.ok(getTradingRoyalty(1000, talent) > 0);
  assert.ok(getTransactionFee(1000, talent) > 0);
});

test("getTradingRoyalty: no anchor date at all charges the standard rate (fail safe, matches getTransactionFee's own fail-safe)", () => {
  const talent = {};
  assert.equal(getTradingRoyalty(1000, talent), +(1000 * TRADING_ROYALTY_PERCENT).toFixed(2));
});
