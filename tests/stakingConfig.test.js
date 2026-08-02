import { test } from "node:test";
import assert from "node:assert/strict";
import { STAKE_LOCK_MULTIPLIERS, VALID_LOCK_PERIODS } from "../config/stakingConfig.js";

test("STAKE_LOCK_MULTIPLIERS maps all 4 valid lock periods to their spec'd multiplier", () => {
  assert.equal(STAKE_LOCK_MULTIPLIERS[30], 1.0);
  assert.equal(STAKE_LOCK_MULTIPLIERS[90], 1.25);
  assert.equal(STAKE_LOCK_MULTIPLIERS[180], 1.5);
  assert.equal(STAKE_LOCK_MULTIPLIERS[365], 2.0);
});

test("STAKE_LOCK_MULTIPLIERS has no entry for an invalid lock period", () => {
  assert.equal(STAKE_LOCK_MULTIPLIERS[45], undefined);
  assert.equal(STAKE_LOCK_MULTIPLIERS[0], undefined);
  assert.equal(STAKE_LOCK_MULTIPLIERS[-30], undefined);
});

test("VALID_LOCK_PERIODS contains exactly the 4 spec'd periods", () => {
  assert.deepEqual(VALID_LOCK_PERIODS.sort((a, b) => a - b), [30, 90, 180, 365]);
});
