import { run } from "./exec";

export interface SilenceWindow {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceResult {
  /** dB threshold this pass used. */
  thresholdDb: number;
  minDurationSeconds: number;
  windows: SilenceWindow[];
  totalSilenceSeconds: number;
  longestSilenceSeconds: number;
}

/**
 * Instrument 3 — silence detection at two thresholds.
 *
 * Settles "whether held beats exist, and where — pause behaviour is an edit
 * fact, not an impression" (§42 Part 1). Two thresholds because a held beat
 * under room tone reads as silence at -40 dB and as signal at -30 dB; the
 * difference between the two passes is what distinguishes a designed pause
 * from a gap in the VO.
 *
 * This is also the instrument behind §17's measured finding that written
 * pause instructions produce no measurable silence, and behind §28G's
 * entry-latency and dead-air checks in E1.
 */
export async function detectSilence(
  path: string,
  thresholdDb: number,
  minDurationSeconds = 0.3,
): Promise<SilenceResult> {
  const { stderr } = await run("ffmpeg", [
    "-i", path,
    "-af", `silencedetect=noise=${thresholdDb}dB:d=${minDurationSeconds}`,
    "-f", "null",
    "-",
  ], { allowFailure: true });

  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));

  const windows: SilenceWindow[] = [];
  for (let i = 0; i < starts.length; i++) {
    // A silence still open at EOF has a start with no matching end.
    if (ends[i] === undefined) continue;
    windows.push({
      start: Number(starts[i].toFixed(3)),
      end: Number(ends[i].toFixed(3)),
      duration: Number((ends[i] - starts[i]).toFixed(3)),
    });
  }

  return {
    thresholdDb,
    minDurationSeconds,
    windows,
    totalSilenceSeconds: Number(windows.reduce((a, w) => a + w.duration, 0).toFixed(3)),
    longestSilenceSeconds: Number(Math.max(0, ...windows.map((w) => w.duration)).toFixed(3)),
  };
}

export interface VolumeResult {
  meanVolumeDb: number;
  maxVolumeDb: number;
  /** EBU R128 integrated loudness, LUFS. */
  integratedLufs: number | null;
  /** Loudness range. Low LRA with high integrated loudness = normalised-hot. */
  loudnessRangeLu: number | null;
  truePeakDb: number | null;
  /**
   * The §42 Part 1 finding this settles: "VO register — normalised-hot vs
   * dynamic". Derived from LRA where R128 ran, from the mean/max spread where
   * it did not.
   */
  register: "normalised-hot" | "dynamic" | "indeterminate";
}

/** Instrument 4 — volume statistics. Settles the VO register and what CapCut must compensate. */
export async function measureVolume(path: string): Promise<VolumeResult> {
  const { stderr } = await run("ffmpeg", [
    "-i", path,
    "-af", "volumedetect,ebur128=peak=true",
    "-f", "null",
    "-",
  ], { allowFailure: true });

  const num = (pattern: RegExp): number | null => {
    const m = stderr.match(pattern);
    return m ? Number(m[1]) : null;
  };

  const meanVolumeDb = num(/mean_volume:\s*(-?[\d.]+) dB/) ?? 0;
  const maxVolumeDb = num(/max_volume:\s*(-?[\d.]+) dB/) ?? 0;

  // ebur128 prints a Summary block at the end; take the last match so the
  // final integrated figure wins over the rolling ones.
  const lastMatch = (pattern: RegExp): number | null => {
    const all = [...stderr.matchAll(pattern)];
    return all.length ? Number(all[all.length - 1][1]) : null;
  };

  const integratedLufs = lastMatch(/I:\s*(-?[\d.]+) LUFS/g);
  const loudnessRangeLu = lastMatch(/LRA:\s*(-?[\d.]+) LU/g);
  const truePeakDb = lastMatch(/Peak:\s*(-?[\d.]+) dBFS/g);

  let register: VolumeResult["register"] = "indeterminate";
  if (loudnessRangeLu !== null) {
    // A compressed, normalised VO sits in a narrow loudness range. Broadcast
    // guidance treats LRA under ~6 LU as heavily compressed; dialogue-led
    // dynamic content typically measures well above it.
    register = loudnessRangeLu < 6 ? "normalised-hot" : "dynamic";
  } else if (maxVolumeDb !== null && meanVolumeDb !== null) {
    register = maxVolumeDb - meanVolumeDb < 12 ? "normalised-hot" : "dynamic";
  }

  return { meanVolumeDb, maxVolumeDb, integratedLufs, loudnessRangeLu, truePeakDb, register };
}
