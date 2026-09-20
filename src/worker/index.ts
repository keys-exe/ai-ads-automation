#!/usr/bin/env tsx
/**
 * The background worker.
 *
 * Runs separately from the web process because §42 Part 1's instruments are
 * minutes of ffmpeg and Whisper, which no request should be holding open.
 */

import { getBoss, QUEUE_ABSORB_INSPO, QUEUE_ABSORB_SCRIPT, type AbsorbInspoJob, type AbsorbScriptJob } from "./queue";
import { runAbsorbInspo, runAbsorbScript } from "../processes/runner";

const boss = await getBoss();

await boss.work<AbsorbInspoJob>(QUEUE_ABSORB_INSPO, { batchSize: 1 }, async (jobs) => {
  for (const job of jobs) {
    console.log(`[absorb-inspo] process ${job.data.processId} (build ${job.data.buildId})`);
    await runAbsorbInspo(job.data.processId);
    console.log(`[absorb-inspo] process ${job.data.processId} done`);
  }
});

await boss.work<AbsorbScriptJob>(QUEUE_ABSORB_SCRIPT, { batchSize: 1 }, async (jobs) => {
  for (const job of jobs) {
    console.log(`[absorb-script] process ${job.data.processId} (build ${job.data.buildId})`);
    await runAbsorbScript(job.data.processId);
    console.log(`[absorb-script] process ${job.data.processId} done`);
  }
});

console.log("worker ready:", [QUEUE_ABSORB_INSPO, QUEUE_ABSORB_SCRIPT].join(", "));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`\n${signal} — draining`);
    await boss.stop({ graceful: true });
    process.exit(0);
  });
}
