import { run } from "./exec";

export interface LuminanceSample {
  time: number;
  /** Mean luma, 0-255. */
  yAvg: number;
}

export interface LuminanceResult {
  samples: LuminanceSample[];
  /** Points where mean luma shifts hard — location, register or act boundaries. */
  changes: Array<{ time: number; from: number; to: number; delta: number }>;
  meanLuma: number;
  /**
   * The largest luma delta across any cut. §15 requires a measurable shift at
   * the B-roll cut; this reports what the reference actually achieved.
   */
  maxCutDelta: number;
  sampleFps: number;
}

/**
 * Instrument 5 — luminance timeline.
 *
 * Settles "location/register changes, act boundaries, the §15 delta the
 * reference actually achieves" (§42 Part 1).
 */
export async function luminanceTimeline(
  path: string,
  sampleFps = 2,
  changeThreshold = 18,
): Promise<LuminanceResult> {
  const { stderr } = await run("ffmpeg", [
    "-i", path,
    "-vf", `fps=${sampleFps},signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
    "-f", "null",
    "-",
  ], { allowFailure: true });

  // metadata=print emits paired lines: a frame line carrying pts_time, then
  // the key line carrying the value.
  const samples: LuminanceSample[] = [];
  const lines = stderr.split("\n");
  let pendingTime: number | null = null;

  for (const line of lines) {
    const frame = line.match(/pts_time:([\d.]+)/);
    if (frame) {
      pendingTime = Number(frame[1]);
      continue;
    }
    const value = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
    if (value && pendingTime !== null) {
      samples.push({ time: Number(pendingTime.toFixed(2)), yAvg: Number(Number(value[1]).toFixed(2)) });
      pendingTime = null;
    }
  }

  const changes: LuminanceResult["changes"] = [];
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].yAvg - samples[i - 1].yAvg;
    if (Math.abs(delta) >= changeThreshold) {
      changes.push({
        time: samples[i].time,
        from: samples[i - 1].yAvg,
        to: samples[i].yAvg,
        delta: Number(delta.toFixed(2)),
      });
    }
  }

  const meanLuma = samples.length
    ? Number((samples.reduce((a, s) => a + s.yAvg, 0) / samples.length).toFixed(2))
    : 0;

  return {
    samples,
    changes,
    meanLuma,
    maxCutDelta: Number(Math.max(0, ...changes.map((c) => Math.abs(c.delta))).toFixed(2)),
    sampleFps,
  };
}
