import cron from "node-cron";
import { recalculateAllTalentValuations } from "./famescoreService.js";

// Default: every night at 03:00 server time — low-traffic window, and once a
// day is plenty since social follower counts don't meaningfully change more
// often than that. Override via FAMESCORE_CRON_SCHEDULE in .env (standard
// 5-field cron syntax) without touching code.
const DEFAULT_SCHEDULE = "0 3 * * *";

let task = null;

export function startFameScoreScheduler() {
  const schedule = process.env.FAMESCORE_CRON_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(
      `FameScore scheduler NOT started: invalid FAMESCORE_CRON_SCHEDULE "${schedule}"`
    );
    return;
  }

  task = cron.schedule(schedule, async () => {
    const startedAt = new Date().toISOString();
    try {
      const summary = await recalculateAllTalentValuations();
      console.log(
        `[FameScore] run @ ${startedAt}: ${summary.succeeded}/${summary.total} talents re-marked successfully` +
          (summary.failed ? `, ${summary.failed} failed` : "")
      );
      if (summary.failed) {
        for (const r of summary.results.filter((r) => !r.success)) {
          console.error(`[FameScore] talent ${r.talent_id} failed: ${r.error}`);
        }
      }
    } catch (err) {
      console.error(`[FameScore] run @ ${startedAt} crashed:`, err.message);
    }
  });

  console.log(`FameScore scheduler started (schedule: "${schedule}")`);
}

export function stopFameScoreScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}
