import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./exec";

export interface OverlayHit {
  time: number;
  text: string;
}

export interface OcrResult {
  hits: OverlayHit[];
  /** Deduped overlay strings, longest first — the text-overlay inventory. */
  inventory: string[];
  framesSampled: number;
  sampleFps: number;
}

/**
 * Instrument 6 — OCR pass.
 *
 * Settles the "text-overlay inventory — everything that is post, catalogued so
 * none of it leaks into prompts (§17)". This is the instrument that keeps a
 * reference's on-screen type out of our generation prompts, which matters
 * because §17 says small generated type garbles and is the one failure post
 * cannot fix.
 */
export async function ocrOverlays(path: string, sampleFps = 0.5): Promise<OcrResult> {
  const dir = await mkdtemp(join(tmpdir(), "ocr-"));
  try {
    await run("ffmpeg", [
      "-i", path,
      "-vf", `fps=${sampleFps}`,
      "-q:v", "2",
      join(dir, "frame-%05d.jpg"),
    ], { allowFailure: true });

    const frames = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
    const hits: OverlayHit[] = [];

    for (const [i, frame] of frames.entries()) {
      const base = join(dir, `${frame}.out`);
      await run("tesseract", [join(dir, frame), base, "--psm", "11"], { allowFailure: true });
      let text = "";
      try {
        text = await readFile(`${base}.txt`, "utf8");
      } catch {
        continue;
      }
      const cleaned = text
        .split("\n")
        .map((l) => l.trim())
        // Drop OCR noise: single characters and strings with no letters at all.
        .filter((l) => l.length > 2 && /[A-Za-z]/.test(l))
        .join(" ")
        .trim();
      if (cleaned) hits.push({ time: Number((i / sampleFps).toFixed(2)), text: cleaned });
    }

    const inventory = [...new Set(hits.map((h) => h.text))].sort((a, b) => b.length - a.length);

    return { hits, inventory, framesSampled: frames.length, sampleFps };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Extract one representative still per shot, base64-encoded, for the model to
 * read in Part 2's structure map. These are evidence, not decoration: the
 * TH/B-roll call and the §30B function per shot are read off the frames.
 */
export async function sampleShotFrames(
  path: string,
  shots: Array<{ index: number; tIn: number; tOut: number }>,
  maxFrames = 40,
): Promise<Array<{ shotIndex: number; time: number; base64: string }>> {
  const dir = await mkdtemp(join(tmpdir(), "shots-"));
  try {
    // On a long reference the shot count exceeds what is useful to send, so
    // sample evenly across the runtime rather than truncating to the opening.
    const step = Math.max(1, Math.ceil(shots.length / maxFrames));
    const chosen = shots.filter((_, i) => i % step === 0).slice(0, maxFrames);

    const out: Array<{ shotIndex: number; time: number; base64: string }> = [];
    for (const shot of chosen) {
      // A frame from the middle of the shot, not the first: the first frame of
      // a shot is often mid-transition.
      const time = shot.tIn + (shot.tOut - shot.tIn) / 2;
      const file = join(dir, `shot-${shot.index}.jpg`);
      await run("ffmpeg", [
        "-ss", time.toFixed(3),
        "-i", path,
        "-frames:v", "1",
        "-vf", "scale=512:-1",
        "-q:v", "4",
        file,
      ], { allowFailure: true });
      try {
        const buf = await readFile(file);
        out.push({ shotIndex: shot.index, time: Number(time.toFixed(2)), base64: buf.toString("base64") });
      } catch {
        // A frame that failed to extract is skipped rather than faked.
      }
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
