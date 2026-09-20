/**
 * §18 step 2 — ABSORB THIS SCRIPT, PRODUCT[, PRODUCT PLACEMENT] AND PRODUCT SHEET.
 *
 * Step 2 carries more load than its name suggests. It absorbs the `.md` + `.py`
 * pair and creates it where absent; it runs the §43A claims pass so every
 * figure is tiered before anything builds against it; it builds the §27B phrase
 * inventory as a mechanical pass over the script as written; and it writes the
 * §18A Mode & Model Lock. Every other lock — camera, format, tools, mechanism
 * claim, declared side — resolves here too.
 *
 * Nothing in this step generates. It is one model call plus bookkeeping.
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import { callWithStandards } from "@/lib/claude";
import { ScriptAbsorption } from "./schemas";
import type { AbsorptionSheet } from "./schemas";

export const SCRIPT_SECTIONS = [
  "18",           // the eight-step flow this step sits in
  "18A",          // Mode & Model Lock — the artefact this step writes
  "2",            // mode selection rules
  "3",            // format selection
  "3A",           // narrated B-roll default fires silently and is recorded here
  "8",            // product spec schema — what the Product Sheet must carry
  "9",            // product presence and placement lock
  "9D",           // worn product visibility — what a missing placement ref blocks
  "12A",          // mechanism register — the mechanism claim lock
  "13",           // B-roll casting, for the buyer age band
  "27",           // the split triggers the phrase inventory runs on
  "27B",          // coverage ledger — the inventory's home
  "43",           // declined executions
  "43A",          // claim substantiation — the tiering pass
  "44",           // locked defaults
  "45",           // tone and working rules
  "APPENDIX-B",   // Product Sheet schema
];

/**
 * The operator-facing prompt. The placement clause is present only where a
 * product placement reference was uploaded, so the label is a record of what
 * the bundle actually held rather than a UI string.
 */
export function scriptAbsorptionLabel(hasPlacement: boolean): string {
  return hasPlacement
    ? "ABSORB THIS SCRIPT, PRODUCT, PRODUCT PLACEMENT AND PRODUCT SHEET"
    : "ABSORB THIS SCRIPT, PRODUCT, AND PRODUCT SHEET";
}

const TASK = `You are executing §18 step 2: absorbing the script, the product, the Product Sheet, and — where one was supplied — the product placement reference.

Produce five things:

1. THE PHRASE INVENTORY (§27B). A mechanical pass over the script as written. Split it per §27's triggers into sequential P-001, P-002 ... rows and record which trigger caused each split. Do not assign dispositions — that is step 5's job. Do not merge, do not force-split a clause with no internal shift, and above all do not edit the script. The script is absorbed as written: a line is never rewritten to rescue a claim or a coverage gap.

2. THE CLAIMS PASS (§43A). Every numeric, clinical, comparative, timeframe or mechanism claim in the script gets a tier. Tier 1 requires the advertiser to actually hold a source — a figure being real in the literature is not the same thing. Tier 2's qualification is flagged and the line is NOT altered. Tier 3 means the beat is BLOCKED pending an advertiser decision; the line is not rewritten and the claim is not cut. Raising this is part of your role — flag unsupported claims without being asked.

3. THE MODE & MODEL LOCK (§18A). Read the script for four things before choosing: how many beats carry a readable wordmark, how many hold a face at medium-close or tighter, how much volume B-roll carries no type, and whether the build has a mechanism act. Then lock one mode and one image model per beat class, each with a one-line reason. The arsenal is exactly three models — nano_banana_pro, nano_banana_2, gpt_image_2_5 Sunburst — and nothing else. Every gpt_image_2_5 route passes variant sunburst, quality high and resolution 2k explicitly, because the catalogue defaults are flare, low and 1k and an omitted variant silently runs a retired model.

4. THE REMAINING LOCKS. Camera, format, tools, mechanism claim, declared side — each with the section it binds.

5. THE PRODUCT SHEET STATE. Where a Product Sheet was supplied, absorb it against Appendix B's eleven fields and report gaps. Where none was supplied, draft the fields you can derive from the product images and the script, and mark the rest as gaps with what each one blocks.

Two standing rules for this step:

- Where a script line contradicts a product spec or a visual standard, the render follows the higher layer and the line is FLAGGED. Record it as a collision. Never rewrite it.
- If no product placement reference was supplied, say so in the placement lock and state the consequence: §9D blocks REVEAL beats until a worn-placement reference exists.`;

export interface AbsorbScriptInput {
  scriptText: string;
  productSheetText: string | null;
  /** Product reference images, base64. §7 puts these at the top of the order of authority. */
  productImages: Array<{ filename: string; mediaType: string; base64: string }>;
  /** The optional fifth box. Its absence is load-bearing, not neutral. */
  placementImages: Array<{ filename: string; mediaType: string; base64: string }>;
  /** Step 1's output, where it has run. The Style Lock and format read inform the locks. */
  absorptionSheet?: AbsorptionSheet | null;
  onStage?: (stage: string) => void;
}

export interface AbsorbScriptResult {
  absorption: ScriptAbsorption;
  usage: Awaited<ReturnType<typeof callWithStandards>>["usage"];
  label: string;
}

const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function imageBlocks(
  images: Array<{ filename: string; mediaType: string; base64: string }>,
  heading: string,
): Anthropic.ContentBlockParam[] {
  if (!images.length) return [];
  return [
    { type: "text", text: heading },
    ...images.flatMap((img): Anthropic.ContentBlockParam[] => {
      // The API accepts a fixed set of image media types; anything else in the
      // bundle is named rather than silently dropped, so a bad upload is
      // visible instead of quietly absent from the model's view.
      if (!IMAGE_MEDIA_TYPES.has(img.mediaType)) {
        return [{ type: "text", text: `(${img.filename}: unsupported image type ${img.mediaType}, not shown)` }];
      }
      return [
        { type: "text", text: img.filename },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.base64,
          },
        },
      ];
    }),
  ];
}

export async function absorbScript(input: AbsorbScriptInput): Promise<AbsorbScriptResult> {
  const {
    scriptText,
    productSheetText,
    productImages,
    placementImages,
    absorptionSheet,
    onStage = () => {},
  } = input;

  const hasPlacement = placementImages.length > 0;
  const label = scriptAbsorptionLabel(hasPlacement);

  onStage("model");

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `# ${label}` },
    {
      type: "text",
      text: `## The script, as written\n\nAbsorb this verbatim. Do not edit it.\n\n---\n\n${scriptText}`,
    },
    {
      type: "text",
      text: productSheetText
        ? `## Product Sheet (supplied)\n\n${productSheetText}`
        : `## Product Sheet\n\nNone supplied. Draft what Appendix B's eleven fields allow from the product images and the script, and mark every remaining field as a gap with what it blocks.`,
    },
    ...imageBlocks(productImages, "## Product reference images\n\nThese are the canonical reference set and sit at the top of the order of authority (§7). Read the spec off these, never off the script's description of them."),
    ...(hasPlacement
      ? imageBlocks(placementImages, "## Product placement reference\n\nThe worn-placement reference (§9A-P). Derive [SITE], [LANDMARK] and [OFFSET] from this — in units, never in body parts.")
      : [{
          type: "text" as const,
          text: "## Product placement reference\n\nNone supplied. Record this in the placement lock with its consequence under §9D — REVEAL beats are BLOCKED until a worn-placement reference exists.",
        }]),
    ...(absorptionSheet
      ? [{
          type: "text" as const,
          text: `## Absorption Sheet from step 1\n\nThe Style Lock and format read below were absorbed from the reference video. The locks you write must be consistent with them.\n\n${JSON.stringify(
            {
              formatRead: absorptionSheet.formatRead,
              styleLock: absorptionSheet.styleLock,
              tieBreaks: absorptionSheet.tieBreaks,
              claimsHarvest: absorptionSheet.claimsHarvest,
            },
            null,
            2,
          )}`,
        }]
      : []),
  ];

  const result = await callWithStandards({
    sections: SCRIPT_SECTIONS,
    schema: ScriptAbsorption,
    task: TASK,
    content,
    maxTokens: 48000,
    effort: "high",
  });

  return { absorption: result.output, usage: result.usage, label };
}
