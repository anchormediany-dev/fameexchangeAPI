// utils/money.js
export function toMinorUnits(amountMajor, currency = "usd") {
  // Most currencies are 2-decimal. (If you’ll support 0-decimal (JPY) etc., branch here.)
  return Math.round(Number(amountMajor) * 100);
}

export function calcUnitPriceFromEvent(eventDoc) {
  // Priority: explicit `price` → else `regular_price - discount_percent`
  if (typeof eventDoc?.price === "number") return Math.max(eventDoc.price, 0);

  const base = Number(eventDoc?.regular_price ?? 0);
  const discountPct = Number(eventDoc?.discount_percent ?? 0);
  const discounted = base * (1 - Math.min(Math.max(discountPct, 0), 100) / 100);
  return Math.max(discounted, 0);
}

export function safeTotal(unitPrice, quantity) {
  const q = Math.max(Number(quantity || 1), 1);
  return Number((Number(unitPrice) * q).toFixed(2));
}
