import {
  MARKET_MAKING,
  TARGET_ANCHOR_PRICE,
  MIN_TOTAL_SHARES,
  MAX_TOTAL_SHARES,
} from "../config/marketMakingConfig.js";

/**
 * Sizes a newly-tradeable talent's fixed share supply from their estimated
 * monetization value, called exactly once — at the moment a talent becomes
 * tradeable (immediately at signup if they qualify right away, or at
 * Futures graduation — see talentApplicationService.js / controllers/
 * talentController.js / futuresPledgeService.js graduateTalentToTradeable()).
 *
 * total_shares = estimatedMonetizationValue / TARGET_ANCHOR_PRICE, clamped
 * to [MIN_TOTAL_SHARES, MAX_TOTAL_SHARES]. Substituting back in, this means
 * initial_share_price lands near 2x TARGET_ANCHOR_PRICE for most talents
 * (the "x2 for future growth potential" multiplier), with the clamp bounds
 * doing the real differentiating work at the extremes — a very small or
 * very large monetization value gets a genuinely different price than the
 * typical band, everyone else lands in a similar per-share price range
 * (similar to how real stocks get priced/split to stay "normal").
 */
export function computeShareAllocation(estimatedMonetizationValue) {
  const value = Math.max(0, Number(estimatedMonetizationValue) || 0);

  const rawShares = Math.round(value / TARGET_ANCHOR_PRICE);
  const totalShares = Math.min(MAX_TOTAL_SHARES, Math.max(MIN_TOTAL_SHARES, rawShares));

  const initialSharePrice = +Math.max(0.1, (value * 2) / totalShares).toFixed(4);

  const sharesInLiquidityPool = Math.round(totalShares * MARKET_MAKING.liquidityPoolAllocation);

  return {
    totalShares,
    sharesInLiquidityPool,
    initialSharePrice,
  };
}
