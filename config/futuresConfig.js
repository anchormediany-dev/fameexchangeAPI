// "Futures" tier configuration — talents who don't yet qualify for the open
// tradeable market (see QUALIFICATION_THRESHOLDS / SINGLE_PLATFORM_
// QUALIFICATION in famescoreConfig.js) are non-tradeable showcases that fans
// can crowdfund-pledge support to. If/when the talent's FameScore
// recalculation newly qualifies them, every pending pledge is converted into
// real Branded Talent Shares (BTS) at the graduation-moment price, WITH a
// bonus allocation as the reward for having backed them early. If a talent
// never qualifies within the deadline window, pledges are refunded
// automatically.
//
// Qualification used to be a single MIN_FAMESCORE_TRADEABLE score threshold
// (0-1000 scale) — that's gone now that qualification is a multi-factor gate
// evaluated by famescoreService.calculateFameScore() (see famescoreConfig.js).
// The graduation trigger in famescoreService.js now checks `qualified`
// directly instead of comparing a raw score.

// Early pledgers get this fraction of EXTRA shares on top of what their
// dollar amount would buy at the graduation price. E.g. 0.15 = a $100 pledge
// becomes $115 worth of shares once the talent graduates.
export const PLEDGE_BONUS_RATE = 0.15;

// If a futures-tier talent hasn't qualified within this many days of being
// listed, all pending pledges for them are automatically refunded and the
// campaign closes.
export const PLEDGE_DEADLINE_DAYS = 90;

export const MIN_PLEDGE_AMOUNT = 5;
export const MAX_PLEDGE_AMOUNT = 50000;
