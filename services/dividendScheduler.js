import cron from "node-cron";
import { runQuarterlyDividendPayout } from "./dividendService.js";

// Default: Jan/Apr/Jul/Oct 1st, 9am Eastern. Override via
// DIVIDEND_CRON_SCHEDULE in .env.
const DEFAULT_SCHEDULE = "0 9 1 1,4,7,10 *";
const TIMEZONE = "America/New_York";

let task = null;

export function startDividendScheduler() {
  const schedule = process.env.DIVIDEND_CRON_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(`Dividend scheduler NOT started: invalid DIVIDEND_CRON_SCHEDULE "${schedule}"`);
    return;
  }

  task = cron.schedule(
    schedule,
    async () => {
      const startedAt = new Date().toISOString();
      try {
        const summary = await runQuarterlyDividendPayout();
        console.log(
          `[Dividend] run @ ${startedAt}: ${summary.processed} talent(s) distributed, $${summary.total_distributed} total`
        );
      } catch (err) {
        console.error(`[Dividend] run @ ${startedAt} crashed:`, err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  console.log(`Dividend scheduler started (schedule: "${schedule}", timezone: ${TIMEZONE})`);
}

export function stopDividendScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}
