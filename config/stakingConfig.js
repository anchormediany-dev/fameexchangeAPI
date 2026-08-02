// Staking lock-period -> dividend multiplier mapping. Longer locks earn a
// larger share of each quarterly dividend pool (services/dividendScheduler.js
// weights payouts by shares_staked x multiplier).
export const STAKE_LOCK_MULTIPLIERS = {
  30: 1.0,
  90: 1.25,
  180: 1.5,
  365: 2.0,
};

export const VALID_LOCK_PERIODS = Object.keys(STAKE_LOCK_MULTIPLIERS).map(Number);
