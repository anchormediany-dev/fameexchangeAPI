// Shared "2026-Q3"-style quarter labeling — used by
// services/talentRevenueService.js (tagging revenue), services/dividendScheduler.js
// (aggregating the prior quarter's revenue), and services/stakingService.js
// (reporting the most recent quarter's dividend pool).

export function quarterString(date = new Date()) {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${q}`;
}

/**
 * Label + calendar bounds of the quarter immediately before `date`'s
 * quarter — e.g. called on Jan 1st, returns last year's Q4. Used by the
 * quarterly dividend cron, which always distributes the QUARTER THAT JUST
 * ENDED, not the one currently in progress.
 */
export function previousQuarterRange(date = new Date()) {
  const currentQStartMonth = Math.floor(date.getMonth() / 3) * 3;
  const currentQStart = new Date(date.getFullYear(), currentQStartMonth, 1);
  const prevQEnd = new Date(currentQStart.getTime() - 1); // last ms of the prior quarter
  const prevQStartMonth = Math.floor(prevQEnd.getMonth() / 3) * 3;
  const prevQStart = new Date(prevQEnd.getFullYear(), prevQStartMonth, 1);
  return {
    quarterStr: quarterString(prevQStart),
    start: prevQStart,
    end: prevQEnd,
  };
}
