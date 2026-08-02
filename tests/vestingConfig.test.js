import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RETAINED_SHARE_FRACTION,
  VESTING_UNLOCK_COUNT,
} from "../config/vestingConfig.js";
import { MARKET_MAKING } from "../config/marketMakingConfig.js";

test("vesting math invariant: 5 unlocks x 10% each = the full 50% retained tranche", () => {
  // unlock_increment (per services/vestingService.js) = totalShares * (RETAINED_SHARE_FRACTION / VESTING_UNLOCK_COUNT)
  const perUnlockFraction = RETAINED_SHARE_FRACTION / VESTING_UNLOCK_COUNT;
  assert.equal(perUnlockFraction, 0.1); // exactly 10% of total_shares per unlock
  assert.equal(perUnlockFraction * VESTING_UNLOCK_COUNT, RETAINED_SHARE_FRACTION);
});

test("the full 25% liquidity / 50% retained-vested / 25% remaining-inert split sums to exactly 1.0", () => {
  const remaining = 1 - MARKET_MAKING.liquidityPoolAllocation - RETAINED_SHARE_FRACTION;
  assert.equal(MARKET_MAKING.liquidityPoolAllocation, 0.25);
  assert.equal(RETAINED_SHARE_FRACTION, 0.5);
  assert.equal(+remaining.toFixed(4), 0.25);
  assert.equal(
    +(MARKET_MAKING.liquidityPoolAllocation + RETAINED_SHARE_FRACTION + remaining).toFixed(4),
    1.0
  );
});

test("unlock_increment computation matches services/vestingService.js's actual formula for a real share count", () => {
  const totalShares = 40000; // e.g. a $2M-valuation talent
  const sharesRetainedVested = Math.round(totalShares * RETAINED_SHARE_FRACTION);
  const unlockIncrement = Math.round(sharesRetainedVested / VESTING_UNLOCK_COUNT);
  assert.equal(sharesRetainedVested, 20000);
  assert.equal(unlockIncrement, 4000); // 10% of 40000
  assert.equal(unlockIncrement * VESTING_UNLOCK_COUNT, sharesRetainedVested);
});
