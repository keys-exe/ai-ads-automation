/**
 * §42 Part 1 — measure before read.
 *
 * "Objective instruments run before any creative interpretation is offered,
 * and the numbers are reported as a table with the finding each one settles."
 *
 * Every field below is produced by a real instrument. Nothing here is a model
 * estimate, and that separation is the point: "A label is not a measurement.
 * A reference marketed as one register may measure as another... The
 * measurement wins."
 *
 * One row of the Part 1 table is deliberately NOT computed here. The TH/B-roll
 * ratio needs a per-shot judgement about what is on screen, which no ffmpeg
 * filter settles. It is derived in Part 2 from the sampled shot frames and is
 * marked `derived` rather than `measured` so it never sits unmarked beside a
 * real measurement (§45).
 */

import { probe, type ProbeResult } from "./probe";
import { detectScenes, type SceneResult } from "./scenes";
import { detectSilence, measureVolume, type SilenceResult, type VolumeResult } from "./audio";
import { luminanceTimeline, type LuminanceResult } from "./luminance";
import { ocrOverlays, sampleShotFrames, type OcrResult } from "./ocr";
import { transcribe, type TranscriptResult } from "./transcribe";

export * from "./exec";

/** The two thresholds §42 Part 1 calls for. */
export const SILENCE_THRESHOLDS = [-40, -30] as const;

export interface Measurements {
  format: ProbeResult;
  scenes: SceneResult;
  silence: SilenceResult[];
  volume: VolumeResult;
  luminance: LuminanceResult;
  ocr: OcrResult;
  transcript: TranscriptResult | null;
  instrumentVersions: Record<string, string>;
  measuredAt: string;
}

export interface MeasureOptions {
  /** Called as each instrument completes, for the process `stage` column. */
  onStage?: (stage: string) => void;
  sceneThreshold?: number;
  /** Set false where the reference has no speech; Part 4 is then skipped. */
  withTranscript?: boolean;
}

export async function measureVideo(path: string, options: MeasureOptions = {}): Promise<Measurements> {
  const { onStage = () => {}, sceneThreshold = 0.3, withTranscript = true } = options;

  onStage("probe");
  const format = await probe(path);

  onStage("scenes");
  const scenes = await detectScenes(path, sceneThreshold);

  // Audio instruments are meaningless on a silent file and ffmpeg errors
  // rather than returning zeros, so they are gated on the probe result.
  let silence: SilenceResult[] = [];
  let volume: VolumeResult = {
    meanVolumeDb: 0, maxVolumeDb: 0, integratedLufs: null,
    loudnessRangeLu: null, truePeakDb: null, register: "indeterminate",
  };
  let transcript: TranscriptResult | null = null;

  if (format.hasAudio) {
    onStage("silence");
    silence = await Promise.all(SILENCE_THRESHOLDS.map((db) => detectSilence(path, db)));

    onStage("volume");
    volume = await measureVolume(path);

    if (withTranscript) {
      onStage("transcript");
      transcript = await transcribe(path);
    }
  }

  onStage("luminance");
  const luminance = await luminanceTimeline(path);

  onStage("ocr");
  const ocr = await ocrOverlays(path);

  onStage("instruments-complete");

  return {
    format,
    scenes,
    silence,
    volume,
    luminance,
    ocr,
    transcript,
    instrumentVersions: await instrumentVersions(),
    measuredAt: new Date().toISOString(),
  };
}

export { sampleShotFrames };

async function instrumentVersions(): Promise<Record<string, string>> {
  const { run } = await import("./exec");
  const out: Record<string, string> = {};
  const probes: Array<[string, string[]]> = [
    ["ffmpeg", ["-version"]],
    ["tesseract", ["--version"]],
    ["whisper", ["--help"]],
  ];
  for (const [binary, args] of probes) {
    try {
      const { stdout, stderr } = await run(binary, args, { allowFailure: true, timeoutMs: 15000 });
      out[binary] = (stdout || stderr).split("\n")[0].trim().slice(0, 120);
    } catch {
      out[binary] = "unavailable";
    }
  }
  return out;
}

/**
 * The Part 1 table as the Absorption Sheet renders it: instrument, what it
 * settles, and the measured value. Building it here rather than in the model
 * call guarantees the reported numbers are the measured ones.
 */
export function part1Table(m: Measurements): Array<{
  instrument: string;
  settles: string;
  value: string;
  method: "measured" | "derived";
}> {
  const silenceSummary = m.silence
    .map((s) => `${s.thresholdDb}dB: ${s.windows.length} windows, longest ${s.longestSilenceSeconds}s`)
    .join(" · ");

  return [
    {
      instrument: "Duration, aspect, resolution",
      settles: "Format lock inputs (§3)",
      value: `${m.format.durationSeconds.toFixed(2)}s · ${m.format.aspectRatio} · ${m.format.width}×${m.format.height} · ${m.format.frameRate}fps`,
      method: "measured",
    },
    {
      instrument: "Scene-change detection",
      settles: "Shot count, mean shot length, cut rhythm by act",
      value: `${m.scenes.shotCount} shots · mean ${m.scenes.meanShotLength}s · median ${m.scenes.medianShotLength}s`,
      method: "measured",
    },
    {
      instrument: "Silence detection (two thresholds)",
      settles: "Whether held beats exist, and where",
      value: silenceSummary || "no audio stream",
      method: "measured",
    },
    {
      instrument: "Volume statistics",
      settles: "VO register — normalised-hot vs dynamic",
      value: m.format.hasAudio
        ? `mean ${m.volume.meanVolumeDb}dB · max ${m.volume.maxVolumeDb}dB · LRA ${m.volume.loudnessRangeLu ?? "n/a"}LU → ${m.volume.register}`
        : "no audio stream",
      method: "measured",
    },
    {
      instrument: "Luminance timeline",
      settles: "Location/register changes, act boundaries, the §15 delta achieved",
      value: `mean luma ${m.luminance.meanLuma} · ${m.luminance.changes.length} hard shifts · max cut delta ${m.luminance.maxCutDelta}`,
      method: "measured",
    },
    {
      instrument: "OCR pass",
      settles: "Text-overlay inventory — everything that is post (§17)",
      value: `${m.ocr.inventory.length} distinct overlay strings across ${m.ocr.framesSampled} sampled frames`,
      method: "measured",
    },
    {
      instrument: "TH/B-roll ratio",
      settles: "Density pattern per act (§31)",
      value: "derived in Part 2 from sampled shot frames — no instrument settles it",
      method: "derived",
    },
  ];
}
