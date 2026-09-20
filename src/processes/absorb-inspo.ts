/**
 * §18 step 1 — ABSORB INSPO VIDEO.
 *
 * "When an inspo or reference ad is dropped, do not generate prompts
 * immediately. Absorption is a seven-part protocol producing one artefact —
 * the Absorption Sheet — that the act map is then derived from."
 *
 * The step splits in two, and the split is the whole design:
 *
 *   Part 1 runs instruments. No model sees the video before the numbers exist,
 *   because "a label is not a measurement" and the Style Lock in Part 3 is
 *   derived from those numbers. A model asked to estimate mean shot length
 *   would corrupt every lock downstream of it.
 *
 *   Parts 2-7 are the model's, working from the measured table, the transcript
 *   and one sampled frame per shot.
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import { callWithStandards } from "@/lib/claude";
import { measureVideo, part1Table, sampleShotFrames, type Measurements } from "@/instruments";
import { AbsorptionSheet } from "./schemas";

/** The §42 protocol plus the sections it reaches into. Declared, not guessed. */
export const INSPO_SECTIONS = [
  "42",   // the seven-part protocol itself
  "2",    // mode selection
  "3",    // format selection — what the measurements settle
  "3A",   // narrated B-roll, so the format read can rule it out explicitly
  "15",   // B-roll documentation register — the anti-stock ban Part 3 must not break
  "17",   // post-production separation — where the OCR'd overlays belong
  "27",   // per-phrase splitting, for the reference phrase inventory
  "30B",  // B-roll selection: the §30B function every structure-map row carries
  "31",   // Short VSL structure — acts, pacing, retention cadence
  "43",   // declined executions — Part 5's disposition list
  "43A",  // claim substantiation — Part 5's claims harvest
  "45",   // tone and working rules
];

const TASK = `You are executing §18 step 1: absorbing a reference ("inspo") video.

Run §42's seven-part protocol. Part 1 has already been run for you by real instruments — its table is supplied below and its numbers are facts. Do not re-estimate any of them, do not contradict them, and quote them where a part of the protocol is derived from them.

Produce Parts 2 through 7 of the Absorption Sheet.

The stance, which governs every part: a winning reference is a proven formula, and the assignment is to beat it. You beat a winner by copying its formula exactly and out-executing it, never by changing the formula. Style is copied. Surface is replaced. Execution is upgraded.

Three things that are easy to get wrong here:

1. The Style Lock (Part 3) copies the reference's style as evidence, not inspiration — but the CAPTURE AXIS NEVER YIELDS. A realistic reference runs on our locked camera regardless of what shot it. Where the reference was clearly shot on a cinema camera, record that as position-not-look and execute it in our register.

2. The claims harvest (Part 5) never inherits the reference's substantiation. Their figure is our unsourced claim until our advertiser holds a source, so tier it 3 unless a supplied Product Sheet carries the source.

3. Part 6's beat-it plan is a list of named deltas grounded in a measurement or a capability, never an ambition, and none of them may break the Style Lock.`;

export interface AbsorbInspoInput {
  videoPath: string;
  /** Anything already known about the build, e.g. the product name. Optional context. */
  briefNote?: string | null;
  onStage?: (stage: string) => void;
}

export interface AbsorbInspoResult {
  measurements: Measurements;
  sheet: AbsorptionSheet;
  usage: Awaited<ReturnType<typeof callWithStandards>>["usage"];
  framesSampled: number;
}

export async function absorbInspoVideo(input: AbsorbInspoInput): Promise<AbsorbInspoResult> {
  const { videoPath, briefNote, onStage = () => {} } = input;

  // --- Part 1: instruments, before any interpretation.
  const measurements = await measureVideo(videoPath, { onStage });

  onStage("sampling-frames");
  const frames = await sampleShotFrames(videoPath, measurements.scenes.shots);

  onStage("model");

  const table = part1Table(measurements);

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: [
        "# Part 1 — measured (supplied, authoritative)",
        "",
        "| Instrument | Settles | Value | Method |",
        "|---|---|---|---|",
        ...table.map((r) => `| ${r.instrument} | ${r.settles} | ${r.value} | ${r.method} |`),
        "",
        "## Shot table (measured)",
        "",
        "| # | t-in | t-out | duration |",
        "|---|---|---|---|",
        ...measurements.scenes.shots.map((s) => `| ${s.index} | ${s.tIn} | ${s.tOut} | ${s.duration} |`),
        "",
        "## Cut rhythm by decile (measured)",
        "",
        ...measurements.scenes.cutRhythm.map(
          (d) => `- decile ${d.decile} (${d.tIn}s–${d.tOut}s): ${d.shots} shots, mean ${d.meanShotLength}s`,
        ),
        "",
        "## Silence windows (measured, two thresholds)",
        "",
        ...measurements.silence.flatMap((s) => [
          `### ${s.thresholdDb} dB — ${s.windows.length} windows, ${s.totalSilenceSeconds}s total`,
          ...s.windows.slice(0, 60).map((w) => `- ${w.start}s → ${w.end}s (${w.duration}s)`),
        ]),
        "",
        "## Luminance shifts (measured)",
        "",
        ...measurements.luminance.changes.slice(0, 60).map(
          (c) => `- ${c.time}s: ${c.from} → ${c.to} (delta ${c.delta})`,
        ),
        "",
        "## Text-overlay inventory (measured by OCR — all of this is post, per §17)",
        "",
        ...(measurements.ocr.inventory.length
          ? measurements.ocr.inventory.map((t) => `- ${JSON.stringify(t)}`)
          : ["- none detected"]),
        "",
        "## Transcript (measured)",
        "",
        measurements.transcript
          ? [
              `Language: ${measurements.transcript.language} · ${measurements.transcript.wordCount} words · ${measurements.transcript.wordsPerMinute} wpm`,
              "",
              ...measurements.transcript.segments.map((s) => `[${s.start}–${s.end}] ${s.text}`),
            ].join("\n")
          : "No audio stream — Part 4 script absorption cannot run from audio. Say so rather than inventing a script.",
        "",
        briefNote ? `\n## Operator note on this build\n\n${briefNote}` : "",
        "",
        `## Sampled shot frames`,
        "",
        `${frames.length} frames follow, one from the middle of each sampled shot, labelled with their shot index. Read the TH/B-roll call, the subject class and the §30B function off these frames.`,
      ].join("\n"),
    },
    ...frames.flatMap((f): Anthropic.ContentBlockParam[] => [
      { type: "text", text: `Shot ${f.shotIndex} @ ${f.time}s` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.base64 } },
    ]),
  ];

  const result = await callWithStandards({
    sections: INSPO_SECTIONS,
    schema: AbsorptionSheet,
    task: TASK,
    content,
    maxTokens: 48000,
    effort: "high",
  });

  return {
    measurements,
    sheet: result.output,
    usage: result.usage,
    framesSampled: frames.length,
  };
}
