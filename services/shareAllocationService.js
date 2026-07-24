import {
  MARKET_MAKING,
  targetSharePriceFor,
  MIN_TOTAL_SHARES,
  MAX_TOTAL_SHARES,
} from "../config/marketMakingConfig.js";

/**
 * Sizes a newly-tradeable talent's fixed share supply from their notional
 * valuation (services/valuationService.js), called exactly once — at the
 * moment a talent becomes tradeable (immediately at signup if they qualify
 * right away, or at Futures graduation — see talentApplicationService.js /
 * controllers/talentController.js / futuresPledgeService.js
 * graduateTalentToTradeable()).
 *
 * total_shares = valuation / target share price for the talent's valuation
 * tier (SHARE_PRICE_TIERS), rounded to the nearest 500, clamped to
 * [MIN_TOTAL_SHARES, MAX_TOTAL_SHARES]. A higher-valuation talent lands in a
 * higher per-share price band rather than everyone converging on the same
 * price — the flat-anchor-price approach this replaced couldn't
 * differentiate a small creator from a mega-creator.
 */
export function computeShareAllocation(valuation) {
  const value = Math.max(0, Number(valuation) || 0);

  const targetPrice = targetSharePriceFor(value);
  const rawShares = value / targetPrice;
  const roundedShares = Math.round(rawShares / 500) * 500;
  const totalShares = Math.min(MAX_TOTAL_SHARES, Math.max(MIN_TOTAL_SHARES, roundedShares));

  const initialSharePrice = +Math.max(1.0, value / totalShares).toFixed(4);

  const sharesInLiquidityPool = Math.round(totalShares * MARKET_MAKING.liquidityPoolAllocation);

  return {
    totalShares,
    sharesInLiquidityPool,
    initialSharePrice,
    targetSharePrice: targetPrice,
  };
}
