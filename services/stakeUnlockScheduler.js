import cron from "node-cron";
import { runDailyStakeUnlock } from "./stakingService.js";

// Default: 05:30 server time. Override via STAKE_UNLOCK_CRON_SCHEDULE in .env.
const DEFAULT_SCHEDULE = "30 5 * * *";

let task = null;

export function startStakeUnlockScheduler() {
  const schedule = process.env.STAKE_UNLOCK_CRON_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(`StakeUnlock scheduler NOT started: invalid STAKE_UNLOCK_CRON_SCHEDULE "${schedule}"`);
    return;
  }

  task = cron.schedule(schedule, async () => {
    const startedAt = new Date().toISOString();
    try {
      const summary = await runDailyStakeUnlock();
      console.log(`[StakeUnlock] run @ ${startedAt}: ${summary.unlocked} stake(s) unlocked`);
    } catch (err) {
      console.error(`[StakeUnlock] run @ ${startedAt} crashed:`, err.message);
    }
  });

  console.log(`StakeUnlock scheduler started (schedule: "${schedule}")`);
}

export function stopStakeUnlockScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}
