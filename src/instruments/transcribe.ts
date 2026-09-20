import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { run } from "./exec";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  language: string;
  text: string;
  segments: TranscriptSegment[];
  wordCount: number;
  /** Words per minute across the spoken runtime — feeds the Part 3 delivery register. */
  wordsPerMinute: number;
  model: string;
}

/**
 * The Part 4 input: "the full VO/dialogue script is extracted — transcribed
 * from audio, overlays recovered by OCR".
 *
 * Timestamps matter as much as the words: Part 4 splits the reference script
 * into `R-P-` rows and Part 2's structure map has to align them to shots.
 */
export async function transcribe(path: string, model = process.env.WHISPER_MODEL ?? "small"): Promise<TranscriptResult> {
  const dir = await mkdtemp(join(tmpdir(), "asr-"));
  try {
    await run("whisper", [
      path,
      "--model", model,
      "--output_format", "json",
      "--output_dir", dir,
      // Transcribe in the source language rather than translating: Part 4's
      // voice fingerprint is a property of the original wording.
      "--task", "transcribe",
    ], { timeoutMs: 30 * 60 * 1000 });

    const stem = basename(path, extname(path));
    const raw = await readFile(join(dir, `${stem}.json`), "utf8");
    const parsed = JSON.parse(raw) as {
      language?: string;
      text?: string;
      segments?: Array<{ start: number; end: number; text: string }>;
    };

    const segments: TranscriptSegment[] = (parsed.segments ?? []).map((s) => ({
      start: Number(s.start.toFixed(2)),
      end: Number(s.end.toFixed(2)),
      text: s.text.trim(),
    }));

    const text = (parsed.text ?? segments.map((s) => s.text).join(" ")).trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const spokenSeconds = segments.reduce((a, s) => a + (s.end - s.start), 0);

    return {
      language: parsed.language ?? "unknown",
      text,
      segments,
      wordCount,
      wordsPerMinute: spokenSeconds > 0 ? Number(((wordCount / spokenSeconds) * 60).toFixed(1)) : 0,
      model,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
