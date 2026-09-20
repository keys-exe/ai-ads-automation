/**
 * Reducing the script to what is actually spoken.
 *
 * A production script carries scene headings, shot directions, on-screen text,
 * act labels and editor notes. None of that is spoken, and all of it would be
 * read aloud verbatim by a TTS engine — the failure is loud and obvious in the
 * output, which is the good case; the quiet case is a stage direction that
 * reads like dialogue and slips through.
 *
 * §17 already draws this line for generation: text overlays, badges and
 * callouts are post, never inside a prompt. The same boundary applies here.
 *
 * Removals are recorded rather than discarded so the strip is auditable — the
 * §27B pattern of never letting something disappear silently.
 */

import * as z from "zod/v4";
import { callWithStandards } from "@/lib/claude";

export const SpokenScript = z.object({
  text: z.string().describe("only the words a presenter says aloud, in order, with nothing else"),
  removed: z.array(z.object({
    content: z.string().describe("the removed text, verbatim"),
    kind: z.enum([
      "scene-heading", "shot-direction", "on-screen-text", "act-label",
      "editor-note", "speaker-label", "timecode", "other",
    ]),
    reason: z.string(),
  })).describe("everything taken out, so the strip can be checked rather than trusted"),
  warnings: z.array(z.string())
    .describe("anything ambiguous — a line that could be either spoken or a direction. Flag; never guess silently"),
});

export type SpokenScript = z.infer<typeof SpokenScript>;

const TASK = `You are reducing a production script to the words that are actually SPOKEN ALOUD by the presenter.

Keep: dialogue, voiceover, narration — the words a person says.

Remove: scene headings, shot and camera directions, on-screen text and titles, act or section labels, timecodes, speaker name labels, editor notes, parentheticals describing delivery, and anything in brackets describing what is seen rather than said.

Four rules:

1. DO NOT REWRITE ANYTHING YOU KEEP. Not a word, not the punctuation. The script is absorbed as written. Your job is subtraction only — if you find yourself improving a line, stop.

2. Record every removal with its text and why. A silent deletion is the failure this step exists to prevent: it is how a spoken line disappears and nobody notices until the render.

3. Where a line could plausibly be either spoken or a direction, KEEP IT and add a warning naming it. A stray direction read aloud is obvious and cheap to fix; a dropped line of dialogue is invisible until the audio is wrong.

4. Preserve the order and the paragraph breaks of what remains. The breaks carry the pacing.

Return the kept text as one continuous script, ready to be spoken.`;

export async function cleanScript(
  rawScript: string,
  onStage: (stage: string) => void = () => {},
): Promise<SpokenScript> {
  onStage("cleaning-script");

  const result = await callWithStandards({
    // §17 draws the generated-versus-post line; §28G and §29 govern what a
    // spoken block is. The rest of the corpus is irrelevant here.
    sections: ["17", "28G", "29", "45"],
    schema: SpokenScript,
    task: TASK,
    content: [{ type: "text", text: `## The script, as supplied\n\n---\n\n${rawScript}` }],
    maxTokens: 32000,
    effort: "high",
  });

  return result.output;
}
