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
// Reduced 25% from an original 0.15 baseline per business decision.
export const MARKET_MAKING = {
  liquidityPoolAllocation: 0.1125,
  spreadPercent: 0.03, // 3% — base half-spread width when the pool is full
  maxSpreadPercent: 0.05, // 5% — half-spread width when the pool is empty
};

// Reference price we're aiming for at listing — total_shares is sized so
// that (at the initial monetization-value-derived price) shares trade near
// this figure, similar to how real stocks get priced/split into a "normal"
// range. Only a rough anchor: MIN/MAX_TOTAL_SHARES below dominate at the
// extremes (a very small or very large monetization value).
export const TARGET_ANCHOR_PRICE = 10;

export const MIN_TOTAL_SHARES = 10000;
export const MAX_TOTAL_SHARES = 10000000;
