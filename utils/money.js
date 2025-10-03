// utils/money.js
export function toMinorUnits(amountMajor, currency = "usd") {
  // Most currencies are 2-decimal. (If you’ll support 0-decimal (JPY) etc., branch here.)
  return Math.round(Number(amountMajor) * 100);
}

// Returns a discount PERCENT (0..100) based on the provided code.
// Supports both shapes: event.discounts and legacy event.discount.
export function getDiscountPercentFromEvent(event, code) {
  if (!code) return 0;
  const needle = String(code).trim().toLowerCase();

  // Preferred: event.discounts = [{ discount_percent, discount_code | discount_codes }]
  if (Array.isArray(event?.discounts)) {
    for (const d of event.discounts) {
      const pct = Number(d?.discount_percent);
      const has =
        (d?.discount_code &&
          String(d.discount_code).trim().toLowerCase() === needle) ||
        (d?.discount_codes &&
          String(d.discount_codes).trim().toLowerCase() === needle);
      if (has && Number.isFinite(pct) && pct >= 0 && pct <= 100) return pct;
    }
  }

  // Legacy: event.discount = [{ discount_percent, discount_codes }]
  if (Array.isArray(event?.discount)) {
    for (const d of event.discount) {
      const pct = Number(d?.discount_percent);
      const has =
        d?.discount_codes &&
        String(d.discount_codes).trim().toLowerCase() === needle;
      if (has && Number.isFinite(pct) && pct >= 0 && pct <= 100) return pct;
    }
  }

  return 0;
}

// Applies a percent discount to event.price and returns the FINAL unit price.
// If overridePercent is provided (0..100), it wins. Otherwise it can fall back
// to a root-level event.discount_percent if you still store that.
export function calcUnitPriceFromEvent(event, overridePercent) {
  const base = Math.max(Number(event?.price ?? 0), 0);

  // Choose discount %
  let discountPct =
    overridePercent != null
      ? Number(overridePercent)
      : event?.discount_percent != null
      ? Number(event.discount_percent)
      : 0;

  // Clamp to [0, 100] and convert to fraction
  discountPct = Math.min(
    Math.max(Number.isFinite(discountPct) ? discountPct : 0, 0),
    100
  );

  // If you received 10 → treat as 10%
  const discounted = base * (1 - discountPct / 100);

  // Round to cents (optional), and ensure non-negative
  return Math.max(Number(discounted.toFixed(2)), 0);
}

export function safeTotal(unitPrice, quantity) {
  const q = Math.max(Number(quantity || 1), 1);
  return Number((Number(unitPrice) * q).toFixed(2));
}
