/**
 * Output schemas for the two step-1 / step-2 processes.
 *
 * Absent values are `.nullable()` rather than `.optional()` throughout:
 * structured output runs against a strict JSON schema, so a field that may be
 * missing is better modelled as present-and-null. It also makes the artefact
 * self-documenting — a null reads as "asked and answered none", where an
 * absent key reads as "never considered".
 */

import * as z from "zod/v4";

/* ------------------------------------------------------------------ *
 * Step 1 — ABSORB INSPO VIDEO → the Absorption Sheet (§42, seven parts)
 * ------------------------------------------------------------------ */

/** §30B Part 1 — function before subject. */
export const BrollFunction = z.enum([
  "ILLUSTRATE", "DEMONSTRATE", "PROVE", "CONTRAST", "ESTABLISH", "PLANT", "PAYOFF", "REACT", "TRANSITION",
]);

export const BeatType = z.enum(["TH", "BR", "MECH", "PRODUCT", "PROOF", "CTA"]);

/** Part 2 — the structure map, written in the act map's own six-slot language. */
export const ShotRow = z.object({
  index: z.number().int().describe("1-based, matching the measured shot index"),
  tIn: z.number(),
  tOut: z.number(),
  type: BeatType,
  subjectClass: z.string().describe("narrator, hands, object, product, third party, crowd..."),
  function: BrollFunction.nullable().describe("§30B function; null on talking-head shots"),
  register: z.string().describe("documentary, mechanism, product, stylized..."),
  overlayText: z.string().nullable().describe("OCR'd on-screen type in this shot, verbatim; null where none"),
  note: z.string().nullable(),
});

/** Part 3 — Style Lock. Copied exactly; this is evidence, not inspiration. */
export const StyleLock = z.object({
  deliveryRegister: z.string().describe("pace, energy, warmth, whisper/normal, address style — grounded in the measured WPM and loudness register"),
  editRhythm: z.string().describe("mean shot length by act and where it accelerates, quoting the measured numbers"),
  visualGrammar: z.string().describe("framing habits, camera energy, location register"),
  densityPattern: z.string().describe("where it is wall-to-wall and where it breathes, grounded in the silence measurement"),
  retentionArchitecture: z.string().describe("hook mechanic, loop placement, micro-hook cadence"),
  toneOfVoice: z.string().describe("the style of the copy itself"),
});

/**
 * Part 3's tie-break. Style axes yield to the spend-validated winner; compliance
 * axes never do. The capture axis never yields at all — a realistic reference
 * runs on our locked camera regardless of what shot it.
 */
export const TieBreak = z.object({
  axis: z.string(),
  axisClass: z.enum(["style", "compliance", "capture"]),
  referenceBehaviour: z.string(),
  houseStandard: z.string().describe("the section that collides, e.g. §15 or §22A"),
  resolution: z.string().describe("what the build does; on a style axis this is recorded as override-against-measurement in the build's favour"),
});

export const ReferencePhrase = z.object({
  id: z.string().describe("R-P-001, sequential and contiguous"),
  text: z.string(),
  structuralJob: z.enum(["hook", "permission", "agitate", "mechanism", "proof", "offer", "close"]),
  tIn: z.number().nullable(),
  tOut: z.number().nullable(),
});

export const VoiceFingerprint = z.object({
  sentenceRhythm: z.string().describe("measured — short/long alternation, fragment use, with counts"),
  personAndAddress: z.string(),
  readingLevel: z.string(),
  signatureConstructions: z.array(z.string()),
  howNumbersAreSpoken: z.string(),
  howProductIsFirstNamed: z.string(),
});

export const CopyFormula = z.object({
  hookMechanic: z.string(),
  openLoop: z.string().nullable(),
  loopPaysAt: z.string().nullable(),
  claimLadder: z.array(z.string()).describe("what is claimed, in order, escalating how"),
  objectionHandling: z.string().nullable(),
  ctaConstruction: z.string(),
});

/** Part 5 — surfaced, not absorbed. Never silently imported, never silently dropped. */
export const SurfacedConflict = z.object({
  device: z.string(),
  bannedBy: z.string().describe("the section that bans it, e.g. §43 or §17"),
  sanctionedEquivalent: z.string().describe("what covers the same structural slot"),
});

export const HarvestedClaim = z.object({
  claim: z.string().describe("as the reference makes it"),
  tierForOurBuild: z.union([z.literal(1), z.literal(2), z.literal(3)])
    .describe("their substantiation is never inherited — their figure is our unsourced claim until our advertiser holds it, so this is 3 unless our Product Sheet carries a source"),
  reason: z.string(),
});

export const PositionNotLook = z.object({
  device: z.string(),
  theirLook: z.string(),
  ourRegister: z.string(),
});

/** Part 6 — the beat-it plan. Named deltas, never an ambition. */
export const BeatItDelta = z.object({
  weakness: z.string().describe("grounded in a measurement or a named capability gap"),
  delta: z.string(),
  carriedBy: z.string().describe("which beat or act carries it"),
  grounding: z.enum(["measurement", "capability", "substantiation"]),
});

/** Part 7 — the confirmation gate. A register question, not a correction. */
export const GateDecision = z.object({
  question: z.string(),
  recommendation: z.string().describe("take a position — never a neutral option list"),
  section: z.string(),
});

export const AbsorptionSheet = z.object({
  /** Derived from the sampled shot frames, not from an instrument. Marked as such. */
  thBrollRatio: z.object({
    thShots: z.number().int(),
    brollShots: z.number().int(),
    ratio: z.string(),
    perAct: z.array(z.object({ act: z.string(), th: z.number().int(), broll: z.number().int() })),
    method: z.literal("derived").describe("no instrument settles this; it is read off the sampled frames"),
  }),
  labelVsMeasurement: z.string().nullable()
    .describe("where the reference's own marketing contradicts what it measured as; the measurement wins and the difference becomes a build decision. Null where they agree"),
  structureMap: z.array(ShotRow),
  styleLock: StyleLock,
  tieBreaks: z.array(TieBreak),
  captureAxisNote: z.string()
    .describe("what shot the reference, and the position-not-look record of executing it in our register"),
  referencePhrases: z.array(ReferencePhrase),
  copyFormula: CopyFormula,
  voiceFingerprint: VoiceFingerprint,
  surfacedConflicts: z.array(SurfacedConflict),
  claimsHarvest: z.array(HarvestedClaim),
  positionNotLook: z.array(PositionNotLook),
  beatItPlan: z.array(BeatItDelta),
  gateDecisions: z.array(GateDecision),
  /** §3 format read off the measurements, feeding the step-2 lock. */
  formatRead: z.object({
    buildType: z.enum(["UGC Ad", "Short VSL", "Long VSL"]),
    reasoning: z.string(),
    actCount: z.number().int(),
  }),
});

export type AbsorptionSheet = z.infer<typeof AbsorptionSheet>;

/* ------------------------------------------------------------------ *
 * Step 2 — ABSORB THIS SCRIPT, PRODUCT[, PRODUCT PLACEMENT] AND PRODUCT SHEET
 * ------------------------------------------------------------------ */

/**
 * §27B phrase inventory: a mechanical pass over the script as written. Split
 * per §27's triggers. No disposition is assigned here — that is step 5's job.
 */
export const PhraseRow = z.object({
  phraseId: z.string().describe("P-001, sequential and contiguous — a gap is itself the alarm"),
  ordinal: z.number().int(),
  text: z.string().describe("verbatim from the script; never rewritten"),
  splitTrigger: z.string().describe("which of §27's triggers caused this split"),
  structuralJob: z.enum(["hook", "permission", "agitate", "mechanism", "proof", "offer", "close"]).nullable(),
  actHint: z.string().nullable(),
});

/** §43A. Caught at step 2, before anything builds against it. */
export const ClaimRow = z.object({
  text: z.string().describe("the claim as the script states it; never altered"),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kind: z.enum(["numeric", "clinical", "comparative", "timeframe", "mechanism"]),
  source: z.string().nullable().describe("tier 1 only — what the advertiser holds"),
  qualification: z.string().nullable().describe("tier 2 only — the gap, flagged in the editor note; the line is not altered"),
  phraseRef: z.string().nullable(),
  consequence: z.string().describe("tier 3 means the beat is BLOCKED pending an advertiser decision — never rewritten, never cut"),
});

/** §18A Part 2 — one model per beat class, with a stated reason. */
export const ModelRoute = z.object({
  beatClass: z.string(),
  model: z.enum(["nano_banana_pro", "nano_banana_2", "gpt_image_2_5"])
    .describe("the three-model arsenal and no others; nano_banana_flash and GPT Image 2.5 Flare are retired"),
  variant: z.string().nullable().describe("'sunburst' on every gpt_image_2_5 call — an omitted variant runs the retired one"),
  quality: z.string().describe("never omitted — the catalogue default is low"),
  resolution: z.string().describe("2k on every beat type"),
  reason: z.string().describe("§18A requires a one-line reason per route"),
});

export const LockRow = z.object({
  key: z.string(),
  value: z.string(),
  section: z.string(),
  reason: z.string().nullable(),
});

/** A script line contradicting a higher layer. Flagged to the advertiser, never rewritten. */
export const Collision = z.object({
  scriptLine: z.string(),
  phraseRef: z.string().nullable(),
  collidesWith: z.string().describe("the higher layer and its section"),
  recommendation: z.string(),
});

export const ScriptAbsorption = z.object({
  phraseInventory: z.array(PhraseRow),
  claims: z.array(ClaimRow),
  modeLock: z.object({
    mode: z.enum(["Mode 1 Realistic", "Mode 2 3D Pixar", "Mode 3 Claymation"]),
    reason: z.string(),
    hybridByAct: z.array(z.object({ act: z.string(), mode: z.string() }))
      .describe("empty unless a hybrid is declared here; never discovered at the act map"),
  }),
  modelRoutes: z.array(ModelRoute),
  locks: z.array(LockRow)
    .describe("every other lock resolved at step 2 — camera, format, tools, mechanism claim, declared side"),
  collisions: z.array(Collision),
  productSheet: z.object({
    status: z.enum(["supplied", "created", "incomplete"]),
    /** Appendix B's eleven fields. Null where the upload did not supply one. */
    fields: z.array(z.object({
      field: z.string(),
      value: z.string().nullable(),
      gap: z.string().nullable().describe("what is missing and what it blocks"),
    })),
  }),
  placementLock: z.object({
    present: z.boolean().describe("true only where a product placement reference was uploaded"),
    site: z.string().nullable(),
    landmark: z.string().nullable(),
    offset: z.string().nullable(),
    consequence: z.string()
      .describe("§9D: with no worn-placement reference, REVEAL beats are BLOCKED until one exists"),
  }),
  /** §27B's reconciliation line, computed by the model and re-checked in code. */
  reconciliation: z.object({
    phraseCount: z.number().int(),
    claimsByTier: z.object({ tier1: z.number().int(), tier2: z.number().int(), tier3: z.number().int() }),
    blockedCount: z.number().int(),
    collisionCount: z.number().int(),
    note: z.string(),
  }),
});

export type ScriptAbsorption = z.infer<typeof ScriptAbsorption>;
