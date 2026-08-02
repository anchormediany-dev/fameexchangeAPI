// Talent-retained/vesting tranche configuration — layered on top of the
// existing valuation-driven share allocation (services/shareAllocationService.js),
// which stays completely unchanged. See services/vestingService.js.
//
// Combined with MARKET_MAKING.liquidityPoolAllocation (0.25, config/marketMakingConfig.js),
// this gives the exact 25% liquidity / 50% retained-vested / 25% remaining-inert
// split. RETAINED_SHARE_FRACTION / VESTING_UNLOCK_COUNT === 0.10 — i.e. each
// unlock releases 10% of total_shares, matching the spec's own math.
export const RETAINED_SHARE_FRACTION = 0.5;
export const VESTING_UNLOCK_COUNT = 5;
export const VESTING_UNLOCK_INTERVAL_MONTHS = 6;
