/**
 * §18 step 3 — CAST EVERYONE WHO RECURS.
 *
 * "Every subject with two or more beats on the step-2 inventory — the
 * narrator, every named side character, and every anonymous B-roll subject
 * (S-01, S-02...) — gets a full §19 reference sheet."
 *
 * Two rules shape the implementation more than any other:
 *
 *   "Identity strings locked from what rendered, never from what was prompted
 *   (§7 applied to our own output)." — so the sheet is generated first and the
 *   markers are read off the result, not carried forward from the prompt.
 *
 *   "The sheet is generated once and locked. With nothing attached, every
 *   reroll is a new person. Reroll only for a panel failure — never for taste
 *   once the face has landed."
 */

import type Anthropic from "@anthropic-ai/sdk";
import { callWithStandards } from "@/lib/claude";
import { CastOutput } from "./schemas-cast";
import { assembleAvatarSheet } from "@/generation/assemble";
import { buildImageCall, DEFAULT_ROUTES, type ArsenalModel } from "@/generation/arsenal";
import { runImageBatch, type GenerationRequest, type GenerationOutcome } from "@/generation/runner";
import type { GenerationClient } from "@/generation/client";

export const CAST_SECTIONS = [
  "19",   // the sheet, the light rule, the panel check
  "19A",  // character novelty — the eight axes and the five-of-eight gate
  "19B",  // medical professional casting
  "20",   // the constraint sheet
  "22D",  // voice identity — the seven axes and the roster
  "22S",  // skin realism — the stack the sheet takes
  "22T",  // the candid register the sheet's light rule departs from
  "13",   // B-roll casting — buyer age band, one-off rotation
  "14A",  // wardrobe classes are filtered by the character's class register
  "30E",  // recurring subjects get a sheet, not a plate
  "44",   // locked defaults
  "45",
];

const TASK = `You are executing §18 step 3: casting everyone who recurs.

From the step-2 phrase inventory, identify every subject with TWO OR MORE beats — the narrator, every named side character, and every anonymous B-roll subject. Anonymous recurrers get IDs S-01, S-02. Named cast get C-01, C-02. Subjects appearing exactly once are listed separately and are NOT sheeted: §13's rotation stands and novelty is the point for them.

For each sheeted character produce:

1. THE DERIVATION. The character is derived from the angle, never invented: what life makes this script's claim credible? The claim picks the occupation history; the occupation history leaves physical evidence; that evidence is written into the sheet.

2. THE EIGHT AXES (§19A), every one stated. Each axis has a convergence default that the generator will return unless you push away from it — oval symmetrical "kind" faces, silver swept-back hair, the middle of the age band, slim-average builds, middle-class knitwear, no marker, neutral southern English, the tidy kitchen. Push away from all eight. The MARKER axis is mandatory and is exactly one per character.

3. THE CLEARANCE. Every new character must differ from every roster entry on at least FIVE of eight axes. State the count against each entry. Where the roster is empty, say so — the clearance is trivially satisfied and that fact is recorded, not hidden.

4. THE VOICE (§22D), for speaking characters only — all seven axes plus age wear and stress register. A new face delivered with a roster voice, or with the generator's default voice, is a failed delivery. Clear it on at least three axes beyond accent, and clear it against the generator's own default too: a pleasant, mid-pitch, evenly paced, lightly RP narrator with no wear and no habits is what comes back unless you name something else.

5. THE CONSTRAINT SHEET (§20), for speaking characters only.

6. THE WARDROBE CLASSES (§14A). A subset of the six layers drawn from the character's own class register, which is §19A axis 5. A trades character does not own a blazer; an allotment character does not own loafers. Also produce ONE build-level GENERIC class pool for the anonymous cast.

7. THE SHEET FILL. The slots for the locked AVATAR-SHEET block: sex, face, hair, body, wardrobe, window side, wall colour, floor, and the named age features. Do NOT write the sheet prompt itself — the locked blocks are pasted by the pipeline verbatim and your prose goes into their slots. Spend the face and hair fills on SAMENESS: the same tone, the same height, the same distance. A fill that describes the person and leaves the panels to the model returns five cousins.

Where the build has worn beats, the sheet's wardrobe must expose the product's placement site, because the sheet doubles as the body reference for placement.`;

export interface CastInput {
  phraseInventory: Array<{ phraseId: string; text: string; structuralJob: string | null }>;
  declared: Record<string, unknown>;
  productSheetText: string | null;
  absorptionSummary: unknown | null;
  /** Existing roster entries to clear against, across builds. */
  roster: Array<{ characterId: string; name: string; axes: Record<string, unknown> }>;
  onStage?: (stage: string) => void;
}

export async function deriveCast(input: CastInput): Promise<{ cast: CastOutput; usage: unknown }> {
  const { phraseInventory, declared, productSheetText, absorptionSummary, roster, onStage = () => {} } = input;

  onStage("cast-derivation");

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: [
        "## Step-2 phrase inventory",
        "",
        "Recurrence is visible here and nowhere else — this is what casting reads.",
        "",
        ...phraseInventory.map((p) => `${p.phraseId} [${p.structuralJob ?? "—"}] ${p.text}`),
        "",
        "## Locks declared at step 2",
        "",
        JSON.stringify(declared, null, 2),
        "",
        productSheetText ? `## Product Sheet\n\n${productSheetText}` : "## Product Sheet\n\nNone supplied.",
        "",
        absorptionSummary
          ? `## Absorption Sheet (step 1)\n\n${JSON.stringify(absorptionSummary, null, 2)}`
          : "",
        "",
        "## Roster Ledger",
        "",
        roster.length
          ? roster.map((r) => `${r.characterId} ${r.name}: ${JSON.stringify(r.axes)}`).join("\n")
          : "The roster is empty. This is the first character in it — say so in the clearance rather than implying a comparison that did not happen.",
      ].join("\n"),
    },
  ];

  const result = await callWithStandards({
    sections: CAST_SECTIONS,
    schema: CastOutput,
    task: TASK,
    content,
    maxTokens: 48000,
    effort: "high",
  });

  return { cast: result.output, usage: result.usage };
}

export interface SheetGenerationResult {
  outcomes: GenerationOutcome[];
  requests: GenerationRequest[];
}

/**
 * Generate every reference sheet.
 *
 * §19 routes sheets to `gpt_image_2_5` Sunburst at `quality: high`,
 * `resolution: 2k` — measured, and "the three parameters are never left at
 * their catalogue defaults." Nothing is attached: "Prose only, nothing
 * attached, one generation."
 */
export async function generateSheets(
  cast: CastOutput,
  client: GenerationClient,
  options: { onStage?: (stage: string) => void; onManifest?: (m: GenerationRequest[]) => Promise<void> | void } = {},
): Promise<SheetGenerationResult> {
  const { onStage = () => {}, onManifest } = options;

  const model: ArsenalModel = DEFAULT_ROUTES.avatar_sheet;

  const requests: GenerationRequest[] = cast.cast.map((member, index) => {
    const prompt = assembleAvatarSheet(member.sheetFill);
    return {
      index,
      ref: member.characterId,
      // §16B: the label is stated immediately above the call, never after it.
      label: `${member.characterId} · ${member.name} — §19 reference sheet · ${model} sunburst/high/2k · no reference attached`,
      params: buildImageCall({ model, prompt, aspectRatio: "9:16", quality: "high" }),
    };
  });

  onStage(`generating ${requests.length} reference sheets`);

  const outcomes = await runImageBatch({
    client,
    requests,
    onManifest,
    onProgress: (done, total) => onStage(`sheets ${done}/${total}`),
  });

  return { outcomes, requests };
}
