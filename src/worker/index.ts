#!/usr/bin/env tsx
/**
 * The background worker.
 *
 * Runs separately from the web process because §42 Part 1's instruments are
 * minutes of ffmpeg and Whisper, which no request should be holding open.
 */

import {
  getBoss,
  QUEUE_ABSORB_INSPO, QUEUE_ABSORB_SCRIPT, QUEUE_CAST, QUEUE_LOCATIONS, QUEUE_MAPS,
  QUEUE_VOICE, QUEUE_AVATAR,
  type StepJob,
} from "./queue";
import { runAbsorbInspo, runAbsorbScript } from "../processes/runner";
import { runCast, runLocations, runMaps } from "../processes/chain";
import { runVoicePhase, runAvatarPhase } from "../processes/voice/run";

const boss = await getBoss();

/**
 * Steps 3-5 hand off to each other on completion (§18: "send, then straight
 * on"), so a single step-3 job can run the rest of the chain unattended. Each
 * handler is registered identically; the chaining lives in the step itself.
 */
const HANDLERS: Array<[string, (processId: number) => Promise<void>]> = [
  [QUEUE_ABSORB_INSPO, runAbsorbInspo],
  [QUEUE_ABSORB_SCRIPT, runAbsorbScript],
  [QUEUE_CAST, runCast],
  [QUEUE_LOCATIONS, runLocations],
  [QUEUE_MAPS, runMaps],
  // The voice route. Two queues rather than one because take selection is a
  // human gate between them.
  [QUEUE_VOICE, runVoicePhase],
  [QUEUE_AVATAR, runAvatarPhase],
];

for (const [queue, handler] of HANDLERS) {
  await boss.work<StepJob>(queue, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      console.log(`[${queue}] process ${job.data.processId} (build ${job.data.buildId})`);
      await handler(job.data.processId);
      console.log(`[${queue}] process ${job.data.processId} done`);
    }
  });
}

console.log("worker ready:", HANDLERS.map(([q]) => q).join(", "));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`\n${signal} — draining`);
    await boss.stop({ graceful: true });
    process.exit(0);
  });
}
