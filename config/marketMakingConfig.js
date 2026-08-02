// Discrete-share asset model + liquidity-pool market making configuration.
//
// A tradeable talent's shares are a FIXED SUPPLY set once, at the moment
// they become tradeable (either immediately at signup if they qualify
// right away, or at Futures graduation) — see services/shareAllocationService.js.
// A slice of that supply seeds a liquidity pool the market maker quotes
// against; everything else becomes available for pledge-fulfillment /
// direct circulation. Buying pulls shares OUT of the pool into circulation;
// selling returns them. There is no peer-to-peer order matching in v1 — an
// order is rejected outright if the pool can't cover it (see
// services/tradingService.js openTrade()).

// Fraction of total_shares seeded into the liquidity pool at listing.
// 0.25 matches the talent-revenue-share system's "LIQUIDITY" bucket exactly
// (see services/vestingService.js — the other two buckets are 50% talent-
// retained/vesting and 25% remaining inert supply). Previously 0.1125
// (itself a deliberate reduction from an original 0.15 baseline) — this
// change applies to new talents going forward only, never retroactive to
// already-tradeable talents.
export const MARKET_MAKING = {
  liquidityPoolAllocation: 0.25,
  spreadPercent: 0.03, // 3% — base half-spread width when the pool is full
  maxSpreadPercent: 0.05, // 5% — half-spread width when the pool is empty
};

// Superseded by SHARE_PRICE_TIERS below (a flat anchor price couldn't
// differentiate a small creator from a mega-creator once valuations were
// corrected to a realistic scale — see valuationService.js). Kept declared,
// not removed, matching this codebase's existing precedent for retired
// pricing-model constants (liquidity_factor/volatility_multiplier).
export const TARGET_ANCHOR_PRICE = 10;

// Target share price by valuation band — total_shares is sized so shares
// trade near the tier's target price at listing, with higher-valuation
// talents landing in a higher (but still "normal-looking") per-share price
// band, similar to how real stocks get priced/split. `max` is exclusive
// upper bound of the valuation this tier applies to.
export const SHARE_PRICE_TIERS = [
  { max: 50000, targetPrice: 5 },
  { max: 200000, targetPrice: 10 },
  { max: 1000000, targetPrice: 20 },
  { max: 5000000, targetPrice: 50 },
  { max: Infinity, targetPrice: 100 },
];

export function targetSharePriceFor(valuation) {
  const tier = SHARE_PRICE_TIERS.find((t) => valuation < t.max);
  return (tier || SHARE_PRICE_TIERS[SHARE_PRICE_TIERS.length - 1]).targetPrice;
}

// Outer safety clamp, applied after tier-based sizing regardless of which
// tier a talent lands in — also cleanly handles a $0 valuation (rounds to 0
// shares, then floors to MIN_TOTAL_SHARES) with no special-case branch.
export const MIN_TOTAL_SHARES = 10000;
export const MAX_TOTAL_SHARES = 10000000;
