import cron from "node-cron";
import { runDailyVestingUnlock } from "./vestingService.js";

// Default: 05:00 server time — staggered after famescore (03:00) and
// futures (04:00). Override via VESTING_UNLOCK_CRON_SCHEDULE in .env.
const DEFAULT_SCHEDULE = "0 5 * * *";

let task = null;

export function startVestingUnlockScheduler() {
  const schedule = process.env.VESTING_UNLOCK_CRON_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(`VestingUnlock scheduler NOT started: invalid VESTING_UNLOCK_CRON_SCHEDULE "${schedule}"`);
    return;
  }

  task = cron.schedule(schedule, async () => {
    const startedAt = new Date().toISOString();
    try {
      const summary = await runDailyVestingUnlock();
      console.log(`[VestingUnlock] run @ ${startedAt}: ${summary.processed} schedule(s) processed`);
    } catch (err) {
      console.error(`[VestingUnlock] run @ ${startedAt} crashed:`, err.message);
    }
  });

  console.log(`VestingUnlock scheduler started (schedule: "${schedule}")`);
}

export function stopVestingUnlockScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}
