import cron from "node-cron";
import { payOutMonthlyRoyalties } from "./talentEarningsService.js";

// Default: 1st of each month, 9am Eastern. Override via
// ROYALTY_PAYOUT_CRON_SCHEDULE in .env.
const DEFAULT_SCHEDULE = "0 9 1 * *";
const TIMEZONE = "America/New_York";

let task = null;

export function startRoyaltyPayoutScheduler() {
  const schedule = process.env.ROYALTY_PAYOUT_CRON_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(`RoyaltyPayout scheduler NOT started: invalid ROYALTY_PAYOUT_CRON_SCHEDULE "${schedule}"`);
    return;
  }

  task = cron.schedule(
    schedule,
    async () => {
      const startedAt = new Date().toISOString();
      try {
        const summary = await payOutMonthlyRoyalties();
        console.log(
          `[RoyaltyPayout] run @ ${startedAt}: ${summary.processed} talent(s) paid, $${summary.total_paid} total`
        );
      } catch (err) {
        console.error(`[RoyaltyPayout] run @ ${startedAt} crashed:`, err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  console.log(`RoyaltyPayout scheduler started (schedule: "${schedule}", timezone: ${TIMEZONE})`);
}

export function stopRoyaltyPayoutScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}
