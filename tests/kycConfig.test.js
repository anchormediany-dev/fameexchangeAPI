import { test } from "node:test";
import assert from "node:assert/strict";
import { isKycVerified } from "../config/kycConfig.js";

test("isKycVerified: verified user passes", () => {
  assert.equal(isKycVerified({ KYC_Verified: true }), true);
});

test("isKycVerified: unverified user fails", () => {
  assert.equal(isKycVerified({ KYC_Verified: false }), false);
});

test("isKycVerified: no user at all fails (fail closed, not fail open)", () => {
  assert.equal(isKycVerified(null), false);
  assert.equal(isKycVerified(undefined), false);
});

test("isKycVerified: user object missing the field entirely fails", () => {
  assert.equal(isKycVerified({}), false);
});
