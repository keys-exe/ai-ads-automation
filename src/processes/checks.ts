/**
 * The visual gates: §19's panel check and §30G's plate check.
 *
 * A NOTE ON WHO CHECKS. E1 marks both of these HUMAN — an eyeball, with the
 * pipeline queueing it. Running them automatically is a deliberate deviation,
 * taken so the step-3 → step-4 → step-5 chain completes unattended, and it is
 * bounded so it never overstates itself:
 *
 *   - An automatic FAIL is authoritative. It triggers a reroll inside E2's
 *     budget, which is strictly better than shipping a bad sheet.
 *   - An automatic PASS is NOT. The artefact is locked so the chain proceeds,
 *     and `humanReviewPending` stays true so the UI can queue the eyeball E1
 *     actually asks for. Nothing is ever recorded as human-checked when it was
 *     not.
 *
 * §19 is blunt about the cost of getting this wrong: "One failing panel is a
 * reroll of the sheet, not a note: a wrong panel becomes a wrong reference on
 * some beat later."
 */

import * as z from "zod/v4";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "@/lib/claude";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const CheckItem = z.object({
  item: z.string(),
  pass: z.boolean(),
  detail: z.string().describe("what was actually observed — never a restatement of the rule"),
});

const CheckResult = z.object({
  items: z.array(CheckItem),
  pass: z.boolean().describe("false if ANY item fails — one failing panel is a reroll, not a note"),
  rerollReason: z.string().nullable(),
});

export type CheckResult = z.infer<typeof CheckResult> & { humanReviewPending: boolean };

/** §19's panel check, verbatim as its six items. */
const PANEL_CHECK_ITEMS = [
  "The close-up panel is the same person as the front panel — cheekbones, jaw and the declared marker match.",
  "Hair tone is identical in all five panels; no panel is a brighter or different shade.",
  "The window is on the same side in all five panels, and the two profiles are lit from OPPOSITE sides — one from the front, one from behind. Both profiles lit from the front means the model re-lit each panel as a separate portrait, and that is a reroll even when the face holds.",
  "Wardrobe is identical in every panel and present in every panel.",
  "Nothing appears on the skin in one panel that is not in the others — no makeup invented in the close-up, no mark invented on one limb.",
  "The grid holds: heads on one line across the top row, feet on one line, true 90-degree profiles, nothing cut off.",
];

/** §30G's plate check, verbatim as its four items. */
const PLATE_CHECK_ITEMS = [
  "Every shell element is readable in the one frame: wall finish, skirting, architrave, door style, handle, ceiling, floor, threshold, radiator and switches.",
  "One age of building throughout — nothing newer or better kept than the rest.",
  "Daylight only, from the door glass and the open doorway.",
  "Nothing styled and nobody in frame. A plate that reads as a show home is a reroll, not a note — it makes every room in the build read as a show home.",
];

async function runCheck(
  imageUrl: string,
  title: string,
  items: string[],
  context: string,
): Promise<CheckResult> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "url", url: imageUrl } },
    {
      type: "text",
      text: [
        `# ${title}`,
        "",
        context,
        "",
        "Check the attached image against each item below. Report what you actually observe, item by item.",
        "",
        ...items.map((item, i) => `${i + 1}. ${item}`),
        "",
        "Rules for this check:",
        "- Fail an item only on evidence you can point to in the image. Describe what you see, not what the rule says.",
        "- If ANY item fails, the overall result is a fail and the artefact is rerolled.",
        "- Where you genuinely cannot tell from the image, say so in the detail and pass the item — a false fail burns a reroll from a budget of two.",
      ].join("\n"),
    },
  ];

  const client = await getAnthropic();

  const message = await client.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(CheckResult) },
    messages: [{ role: "user", content }],
  }).finalMessage();

  const parsed = message.parsed_output;
  if (!parsed) {
    // A check that cannot parse must not read as a pass.
    return {
      items: [], pass: false,
      rerollReason: "The check itself did not return a parseable result.",
      humanReviewPending: true,
    };
  }

  return { ...parsed, humanReviewPending: true };
}

export function panelCheck(imageUrl: string): Promise<CheckResult> {
  return runCheck(
    imageUrl,
    "§19 panel check — a gate, before the sheet is used anywhere",
    PANEL_CHECK_ITEMS,
    "This is a character reference sheet: five photographs of one person on a single 9:16 canvas. Top row — front, left profile, right profile, full length. Bottom row — a full-length back view and a face close-up.",
  );
}

export function propertyPlateCheck(imageUrl: string): Promise<CheckResult> {
  return runCheck(
    imageUrl,
    "§30G plate check — before any location plate is built against it",
    PLATE_CHECK_ITEMS,
    "This is a property plate: the hall of one house seen from just inside the front door, carrying every finish that repeats through the building. It is empty by design.",
  );
}

/** §30C's per-batch scene check, pointed at a freshly rendered location plate. */
export function locationPlateCheck(imageUrl: string, anchors: string[]): Promise<CheckResult> {
  return runCheck(
    imageUrl,
    "§30C scene check — the plate against its Location Sheet",
    [
      `All named anchors are present and distinct: ${anchors.join("; ")}.`,
      "Nothing is invented — no extra furniture, no duplicated anchor.",
      "The room is empty: no people, no product, nothing staged. A plate with a person in it re-injects that person into every beat built against it.",
      "The palette and materials hold, and the window sits on one clearly readable wall.",
    ],
    "This is a scene plate: the canonical reference for one location, for the whole build.",
  );
}
