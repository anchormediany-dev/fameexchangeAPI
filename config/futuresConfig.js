// "Futures" tier configuration — talents below the FameScore tradeable
// threshold are non-tradeable showcases that fans can crowdfund-pledge
// support to. If/when the talent's FameScore crosses the threshold, every
// pending pledge is converted into real Branded Talent Shares (BTS) at the
// graduation-moment price, WITH a bonus allocation as the reward for having
// backed them early. If a talent never crosses the threshold within the
// deadline window, pledges are refunded automatically.

// A talent needs at least this FameScore (0-1000) to be tradeable on the
// open market. Below this, they're "futures" tier: visible, pledge-able,
// not buyable/sellable on the live market.
export const MIN_FAMESCORE_TRADEABLE = 400;

// Early pledgers get this fraction of EXTRA shares on top of what their
// dollar amount would buy at the graduation price. E.g. 0.15 = a $100 pledge
// becomes $115 worth of shares once the talent graduates.
export const PLEDGE_BONUS_RATE = 0.15;

// If a futures-tier talent hasn't crossed MIN_FAMESCORE_TRADEABLE within
// this many days of being listed, all pending pledges for them are
// automatically refunded and the campaign closes.
export const PLEDGE_DEADLINE_DAYS = 90;

export const MIN_PLEDGE_AMOUNT = 5;
export const MAX_PLEDGE_AMOUNT = 50000;
