/**
 * §18 step 5 — ACT MAP AND WARDROBE MAP, TOGETHER.
 *
 * "Coverage ledger keyed to the step-2 inventory; the §14A story-day
 * derivation pass; wardrobe written per story day as beats land."
 *
 * Nothing generates here. §18 calls step 5 the place "where three expensive
 * things are caught: the product's first appearance is located, screen
 * direction and framing steps are assigned, and unsupported claims are
 * blocked. All three are cheap to fix at the act map and expensive to fix at
 * beat 74."
 *
 * The audits are re-run in code after the model returns them. §14A and §27B
 * both make the check travel with the deliverable; a model that reports its
 * own audit as passing is exactly the case where an independent count matters.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { callWithStandards } from "@/lib/claude";
import { MapsOutput } from "./schemas-cast";

export const MAPS_SECTIONS = [
  "14",   // when wardrobe changes — keyed to the story day
  "14A",  // how much it changes — the stack, the audits, the derivation pass
  "21",   // the Wardrobe Map deliverable
  "27",   // the split triggers
  "27B",  // the coverage ledger and its dispositions
  "30A",  // cross-beat assembly, frame side
  "30B",  // B-roll selection: function, alibi, ownership, run grammar
  "30F",  // emotional register — valence declared at the act map
  "31",   // Short VSL structure — acts, sizing, density, retention beats
  "33",   // beat ID convention
  "9D",   // worn product visibility — the CONCEALED/VISIBLE/REVEAL column
  "43A",  // claims — tier 3 blocks the beat
  "44",
  "45",
];

const TASK = `You are executing §18 step 5: the act map and the wardrobe map, together.

Produce four artefacts in one pass, because they constrain each other.

1. THE STORY-DAY DERIVATION PASS (§14A). Run the five channels D1-D5 over the step-2 phrase inventory. THE DEFAULT IS ONE STORY DAY PER ACT — that makes §19's per-act talking-head wardrobe lock and §14's per-day keying the same rule, and it keeps the act boundary landing as a §31 pattern interrupt. Two acts share a day only where the script explicitly joins them; one act spans two days only where a stated line carries the change. A build has exactly as many outfits as it has story days: more means it changed clothes for no reason, fewer means two days in one shirt.

2. THE WARDROBE LEDGER (§14A, §21). One outfit row per story day, carrying the six-layer garment stack and its colour family; under it, one line per capture event on that day. THE DAY CARRIES THE OUTFIT; THE EVENT CARRIES THE LOCATION, THE VISIBILITY STATE AND THE BEATS. Between consecutive story days at least TWO layers change class and ONE OF THEM IS BASE. A colour change is not a layer change. Garment classes are drawn from each character's own class register — anonymous subjects draw from the build-level GENERIC pool, and their rows go in the SAME ledger, because the audits run across the whole ledger and not per character.

3. THE ACT MAP. One row per beat, carrying every E4 column. story_day and capture_event_id are MANDATORY on every row — a row carrying a wardrobe_ref but no story_day is the exact failure that column was added to remove. Assign the §30B function before the subject. Assign frame side and framing step. Declare valence per beat. State the rig — no beat type is exempt from §22B. Duration comes from the E6 words-to-duration function, never 'auto'.

4. THE COVERAGE LEDGER (§27B). Every P- row from step 2 gets exactly one disposition: BR-xx, TH-xx, MECH-xx, MERGED→P-0xx, or BLOCKED. CUT does not exist as a disposition — a line is never removed to solve a coverage problem. BLOCKED carries its reason and its section, and catches four cases: a §43A tier-3 claim, a §43 declined execution, a line contradicting a higher layer, and a line with no picture, no mechanism and no cover. UNCOVERED MUST READ ZERO. Beat IDs stay contiguous — a gap in the numbering is itself the alarm.

Then state the four §14A audits (W1-W4) with pass/fail and the counts behind them, and write the §27B reconciliation line.

Two things that are decided here and are expensive later: where the product first appears, and which beats carry claims. A tier-3 claim blocks its beat here, not at beat 74.`;

export interface MapsInput {
  phraseInventory: Array<{ phraseId: string; text: string; structuralJob: string | null }>;
  claims: Array<{ text: string; tier: number; phraseRef: string | null }>;
  cast: Array<{ characterId: string; name: string; isNarrator: boolean; wardrobeClasses: unknown; signatureItem: string | null }>;
  genericClassPool: unknown;
  locations: Array<{ locationId: string; name: string; tier: string; beatCount: number; ownership: string }>;
  declared: Record<string, unknown>;
  absorptionSummary: unknown | null;
  onStage?: (stage: string) => void;
}

export async function deriveMaps(input: MapsInput): Promise<{ maps: MapsOutput; usage: unknown }> {
  const {
    phraseInventory, claims, cast, genericClassPool, locations,
    declared, absorptionSummary, onStage = () => {},
  } = input;

  onStage("act-map-derivation");

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: [
        "## Step-2 phrase inventory",
        "",
        "The act map is keyed to this, not the reverse. Every row gets a disposition.",
        "",
        ...phraseInventory.map((p) => `${p.phraseId} [${p.structuralJob ?? "—"}] ${p.text}`),
        "",
        "## Claims tiered at step 2",
        "",
        ...claims.map((c) => `tier ${c.tier} · ${c.phraseRef ?? "—"} · ${c.text}`),
        "",
        "Tier 3 blocks its beat. Report it; do not resolve it and do not rewrite the line.",
        "",
        "## Cast locked at step 3",
        "",
        ...cast.map((c) => `${c.characterId} ${c.name}${c.isNarrator ? " (narrator)" : ""} · classes ${JSON.stringify(c.wardrobeClasses)} · signature ${c.signatureItem ?? "none"}`),
        "",
        `GENERIC class pool for anonymous cast: ${JSON.stringify(genericClassPool)}`,
        "",
        "## Locations closed at step 4",
        "",
        "The set is closed. A location added now is a gated redress, not a quiet addition — if the map needs one that is not here, say so rather than inventing it.",
        "",
        ...locations.map((l) => `${l.locationId} ${l.name} · ${l.tier} · ${l.beatCount} beats · ${l.ownership}`),
        "",
        "## Locks declared at step 2",
        "",
        JSON.stringify(declared, null, 2),
        "",
        absorptionSummary
          ? `## Style Lock from step 1\n\nThe edit rhythm and density pattern below are measured from the reference and govern pacing here.\n\n${JSON.stringify(absorptionSummary, null, 2)}`
          : "",
      ].join("\n"),
    },
  ];

  const result = await callWithStandards({
    sections: MAPS_SECTIONS,
    schema: MapsOutput,
    task: TASK,
    content,
    maxTokens: 64000,
    effort: "high",
  });

  return { maps: result.output, usage: result.usage };
}

/* ------------------------------------------------------------------ *
 * Independent audits — the model reports these, and we recount them.
 * ------------------------------------------------------------------ */

export interface AuditFinding {
  id: string;
  pass: boolean;
  detail: string;
  /** True where our count disagrees with what the model reported. */
  disagreesWithModel: boolean;
}

/**
 * §14A's four audits plus §27B's coverage check, recounted in code.
 *
 * "The check travels with the deliverable, visible, never trusted to memory."
 * A self-reported audit is memory wearing a number.
 */
export function auditMaps(
  maps: MapsOutput,
  phraseIds: string[],
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const days = [...maps.storyDays].sort((a, b) => a.day.localeCompare(b.day));

  // --- W1: no BASE class twice in an act; no exact garment twice in the build
  //         except one declared signature item. Counted across the whole
  //         ledger — narrator and anonymous cast together.
  const baseByAct = new Map<string, string[]>();
  for (const day of days) {
    const act = day.act ?? "(no act)";
    const list = baseByAct.get(act) ?? [];
    list.push(day.outfit.base.toLowerCase().trim());
    baseByAct.set(act, list);
  }
  const w1Repeats: string[] = [];
  for (const [act, bases] of baseByAct) {
    const seen = new Set<string>();
    for (const base of bases) {
      if (seen.has(base)) w1Repeats.push(`${act}: "${base}" repeats`);
      seen.add(base);
    }
  }
  findings.push({
    id: "W1",
    pass: w1Repeats.length === 0,
    detail: w1Repeats.length ? w1Repeats.join("; ") : `No BASE class repeats within an act across ${days.length} story days.`,
    disagreesWithModel: (w1Repeats.length === 0) !== maps.wardrobeAudits.w1.pass,
  });

  // --- W2: every consecutive pair of story days differs on two layers
  //         including BASE.
  const w2Failures: string[] = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1].outfit;
    const curr = days[i].outfit;
    const layers: Array<keyof typeof curr> = ["base", "mid", "outer", "lower", "foot", "accent"];
    const changed = layers.filter((l) => norm(prev[l]) !== norm(curr[l]));
    const baseChanged = norm(prev.base) !== norm(curr.base);
    if (changed.length < 2 || !baseChanged) {
      w2Failures.push(
        `${days[i - 1].day}→${days[i].day}: ${changed.length} layer(s) changed${baseChanged ? "" : ", BASE unchanged"}`,
      );
    }
  }
  findings.push({
    id: "W2",
    pass: w2Failures.length === 0,
    detail: w2Failures.length ? w2Failures.join("; ") : `All ${Math.max(0, days.length - 1)} consecutive pairs change two layers including BASE.`,
    disagreesWithModel: (w2Failures.length === 0) !== maps.wardrobeAudits.w2.pass,
  });

  // --- W3: no two consecutive story days share a colour family.
  const w3Failures: string[] = [];
  for (let i = 1; i < days.length; i++) {
    if (days[i].colourFamily === days[i - 1].colourFamily) {
      w3Failures.push(`${days[i - 1].day}→${days[i].day}: both ${days[i].colourFamily}`);
    }
  }
  findings.push({
    id: "W3",
    pass: w3Failures.length === 0,
    detail: w3Failures.length ? w3Failures.join("; ") : "Colour family rotates between every consecutive pair.",
    disagreesWithModel: (w3Failures.length === 0) !== maps.wardrobeAudits.w3.pass,
  });

  // --- W4: every capture event resolves to a story day, and every story day
  //         resolves to exactly one outfit row.
  const dayIds = new Set(days.map((d) => d.day));
  const orphanEvents = maps.captureEvents.filter((e) => !dayIds.has(e.storyDay)).map((e) => e.eventId);
  const dayCounts = new Map<string, number>();
  for (const day of days) dayCounts.set(day.day, (dayCounts.get(day.day) ?? 0) + 1);
  const multiOutfitDays = [...dayCounts].filter(([, n]) => n > 1).map(([d]) => d);
  // E4: story_day and capture_event_id are mandatory on every act-map row.
  const rowsMissingKeys = maps.actMap
    .filter((r) => !r.storyDay || !r.captureEventId)
    .map((r) => r.beatId);

  const w4Pass = !orphanEvents.length && !multiOutfitDays.length && !rowsMissingKeys.length;
  findings.push({
    id: "W4",
    pass: w4Pass,
    detail: w4Pass
      ? `All ${maps.captureEvents.length} capture events resolve to a story day; every day has exactly one outfit row; every act-map row carries both keys.`
      : [
          orphanEvents.length ? `events with no story day: ${orphanEvents.join(", ")}` : "",
          multiOutfitDays.length ? `days with more than one outfit row: ${multiOutfitDays.join(", ")}` : "",
          rowsMissingKeys.length ? `act-map rows missing story_day or capture_event_id: ${rowsMissingKeys.join(", ")}` : "",
        ].filter(Boolean).join("; "),
    disagreesWithModel: w4Pass !== maps.wardrobeAudits.w4.pass,
  });

  // --- §27B coverage: every phrase gets exactly one disposition, uncovered
  //     must read zero, and beat IDs stay contiguous.
  const dispositioned = new Map<string, number>();
  for (const d of maps.dispositions) {
    dispositioned.set(d.phraseId, (dispositioned.get(d.phraseId) ?? 0) + 1);
  }
  const uncovered = phraseIds.filter((id) => !dispositioned.has(id));
  const duplicated = [...dispositioned].filter(([, n]) => n > 1).map(([id]) => id);
  const coveragePass = uncovered.length === 0 && duplicated.length === 0;

  findings.push({
    id: "COVERAGE",
    pass: coveragePass,
    detail: coveragePass
      ? `All ${phraseIds.length} phrases carry exactly one disposition. Uncovered reads zero.`
      : [
          uncovered.length ? `UNCOVERED (${uncovered.length}): ${uncovered.slice(0, 20).join(", ")}` : "",
          duplicated.length ? `more than one disposition: ${duplicated.join(", ")}` : "",
        ].filter(Boolean).join("; "),
    disagreesWithModel: (uncovered.length === 0) !== (maps.coverage.uncovered === 0),
  });

  // --- Beat ID contiguity: a gap in the numbering is itself the alarm.
  const beatNumbers = maps.actMap
    .map((r) => Number(r.beatId.match(/(\d+)\s*$/)?.[1] ?? NaN))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const gaps: string[] = [];
  for (let i = 1; i < beatNumbers.length; i++) {
    if (beatNumbers[i] - beatNumbers[i - 1] > 1) gaps.push(`${beatNumbers[i - 1]}→${beatNumbers[i]}`);
  }
  findings.push({
    id: "BEAT-IDS",
    pass: gaps.length === 0,
    detail: gaps.length ? `gaps in the beat numbering: ${gaps.join(", ")}` : `${beatNumbers.length} beat IDs, contiguous.`,
    disagreesWithModel: false,
  });

  return findings;
}

function norm(value: string | null): string {
  return (value ?? "").toLowerCase().trim();
}
