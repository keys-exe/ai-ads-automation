import { run } from "./exec";

export interface Shot {
  index: number;
  tIn: number;
  tOut: number;
  duration: number;
}

export interface SceneResult {
  shotCount: number;
  meanShotLength: number;
  medianShotLength: number;
  shots: Shot[];
  /** Mean shot length per equal-length tenth of the runtime — where the cut accelerates. */
  cutRhythm: Array<{ decile: number; tIn: number; tOut: number; shots: number; meanShotLength: number }>;
  threshold: number;
}

/**
 * Instrument 2 — scene-change detection.
 *
 * Settles shot count, mean shot length and cut rhythm by act: "the pacing
 * table, measured not felt" (§42 Part 1). The Style Lock's edit-rhythm axis is
 * derived from these numbers, so an estimate here corrupts every downstream lock.
 */
export async function detectScenes(path: string, threshold = 0.3): Promise<SceneResult> {
  // showinfo prints one line per frame the scene filter selects; ffmpeg writes
  // it to stderr and exits 0 with the null muxer.
  const { stderr } = await run("ffmpeg", [
    "-i", path,
    "-filter:v", `select='gt(scene,${threshold})',showinfo`,
    "-f", "null",
    "-",
  ], { allowFailure: true });

  const cutTimes = [...stderr.matchAll(/pts_time:([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-print_format", "csv=p=0", path,
  ]);
  const duration = Number(stdout.trim());

  // Cut times are boundaries; shots are the spans between them, with the
  // first shot starting at 0 and the last ending at the runtime.
  const boundaries = [0, ...cutTimes.filter((t) => t > 0.05 && t < duration - 0.05), duration];
  const shots: Shot[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    shots.push({
      index: i + 1,
      tIn: Number(boundaries[i].toFixed(3)),
      tOut: Number(boundaries[i + 1].toFixed(3)),
      duration: Number((boundaries[i + 1] - boundaries[i]).toFixed(3)),
    });
  }

  const lengths = shots.map((s) => s.duration).sort((a, b) => a - b);
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const median = lengths.length
    ? lengths.length % 2
      ? lengths[(lengths.length - 1) / 2]
      : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2
    : 0;

  const cutRhythm = [];
  for (let d = 0; d < 10; d++) {
    const tIn = (duration * d) / 10;
    const tOut = (duration * (d + 1)) / 10;
    const inDecile = shots.filter((s) => s.tIn >= tIn && s.tIn < tOut);
    cutRhythm.push({
      decile: d + 1,
      tIn: Number(tIn.toFixed(2)),
      tOut: Number(tOut.toFixed(2)),
      shots: inDecile.length,
      meanShotLength: inDecile.length
        ? Number((inDecile.reduce((a, s) => a + s.duration, 0) / inDecile.length).toFixed(3))
        : 0,
    });
  }

  return {
    shotCount: shots.length,
    meanShotLength: Number(mean.toFixed(3)),
    medianShotLength: Number(median.toFixed(3)),
    shots,
    cutRhythm,
    threshold,
  };
}
