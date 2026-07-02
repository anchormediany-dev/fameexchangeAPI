import cron from "node-cron";
import { refundExpiredFuturesCampaigns } from "./futuresPledgeService.js";

// Daily at 04:00 — checks for futures campaigns past their pledge deadline
// and refunds any pending pledges. Runs after the 03:00 FameScore re-mark so
// a talent that just crossed the threshold graduates BEFORE this job would
// otherwise consider closing its (now-irrelevant) deadline.
const DEFAULT_SCHEDULE = "0 4 * * *";

let task = null;

export function startFuturesScheduler() {
  const schedule = process.env.FUTURES_CRON_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(`Futures scheduler NOT started: invalid FUTURES_CRON_SCHEDULE "${schedule}"`);
    return;
  }

  task = cron.schedule(schedule, async () => {
    const startedAt = new Date().toISOString();
    try {
      const summary = await refundExpiredFuturesCampaigns();
      console.log(`[Futures] run @ ${startedAt}: ${summary.campaigns_closed} expired campaign(s) closed`);
      for (const r of summary.results.filter((r) => !r.success)) {
        console.error(`[Futures] refund failed for pledge ${r.pledge_id}: ${r.error}`);
      }
    } catch (err) {
      console.error(`[Futures] run @ ${startedAt} crashed:`, err.message);
    }
  });

  console.log(`Futures scheduler started (schedule: "${schedule}")`);
}

export function stopFuturesScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}
