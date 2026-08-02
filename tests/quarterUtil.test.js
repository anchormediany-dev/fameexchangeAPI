import { test } from "node:test";
import assert from "node:assert/strict";
import { quarterString, previousQuarterRange } from "../utils/quarter.js";

test("quarterString: boundary cases across quarter/year edges", () => {
  assert.equal(quarterString(new Date(2026, 0, 1)), "2026-Q1"); // Jan 1
  assert.equal(quarterString(new Date(2026, 2, 31)), "2026-Q1"); // Mar 31 -> still Q1
  assert.equal(quarterString(new Date(2026, 3, 1)), "2026-Q2"); // Apr 1 -> Q2
  assert.equal(quarterString(new Date(2026, 11, 31)), "2026-Q4"); // Dec 31 -> Q4
});

test("previousQuarterRange: called on Jan 1st returns LAST YEAR's Q4, not this year's Q4", () => {
  const { quarterStr, start, end } = previousQuarterRange(new Date(2026, 0, 1));
  assert.equal(quarterStr, "2025-Q4");
  assert.equal(start.getFullYear(), 2025);
  assert.equal(start.getMonth(), 9); // October (0-indexed)
  assert.equal(end.getFullYear(), 2025);
  assert.equal(end.getMonth(), 11); // December
});

test("previousQuarterRange: called mid-Q2 returns Q1 of the SAME year", () => {
  const { quarterStr, start, end } = previousQuarterRange(new Date(2026, 4, 15)); // mid-May
  assert.equal(quarterStr, "2026-Q1");
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 0); // January
  assert.equal(end.getMonth(), 2); // March
});

test("previousQuarterRange: quarter_end is the last millisecond before quarter_start of the current quarter (no gap, no overlap)", () => {
  const { start, end } = previousQuarterRange(new Date(2026, 6, 10)); // mid-Q3
  const currentQStart = new Date(2026, 6, 1); // Jul 1
  assert.equal(end.getTime(), currentQStart.getTime() - 1);
  assert.ok(start < end);
});
