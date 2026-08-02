// Trading fee + listing fee structure. Replaces the old flat
// tradingService.js FEE_RATE (0.5%, no promo window, no listing fee).

// Charged on every open/close trade, EXCEPT during the launch promo window.
export const TRANSACTION_FEE_PERCENT = 0.015; // 1.5%

// Every talent gets 0% transaction fees for this many days from whichever
// they hit first — Futures graduation (graduated_at) or listing directly as
// tradeable (createdAt). See getTransactionFee() in tradingService.js.
export const LAUNCH_PROMO_DAYS = 90;
export const LAUNCH_PROMO_FEE_PERCENT = 0;

// Talent trading royalty — paid to the TALENT (not the house), on top of
// the transaction fee above. Waives to 0% during the same launch promo
// window as the transaction fee (see isInPromoWindow()/getTradingRoyalty()
// in tradingService.js) — charging a new fee specifically during the
// window meant to encourage early trading would undercut its own purpose.
export const TRADING_ROYALTY_PERCENT = 0.005; // 0.5%

// Charged exactly once, at the moment a talent becomes tradeable (signup if
// immediately qualifying, or Futures graduation) — see
// futuresPledgeService.graduateTalentToTradeable / talentApplicationService.
export const LISTING_FEE_PERCENT = 0.03; // 3% — per user decision, not the original spec's 2%
export const LISTING_FEE_MINIMUM = 500;

export function calculateListingFee(estimatedMonetizationValue) {
  const value = Math.max(0, Number(estimatedMonetizationValue) || 0);
  return +Math.max(value * LISTING_FEE_PERCENT, LISTING_FEE_MINIMUM).toFixed(2);
}

// Demotion grace period: how long a previously-qualified tradeable talent
// gets to requalify before being suspended (see famescoreService.js).
export const GRACE_PERIOD_DAYS = 30;
