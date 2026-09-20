/**
 * Output schemas for §18 steps 3, 4 and 5.
 *
 * These three steps chain: cast → property and locations → act map and
 * wardrobe map. §18 makes each a DET step that "sends and continues" — a
 * handoff, not an approval — so the chain runs unattended and the artefacts
 * are the record.
 */

import * as z from "zod/v4";

/* ------------------------------------------------------------------ *
 * Step 3 — cast (§19, §19A, §20, §22D, §30E Part 1)
 * ------------------------------------------------------------------ */

/** §19A's eight axes. Every new character is stated on all eight. */
export const CharacterAxes = z.object({
  faceArchitecture: z.string().describe("away from oval/symmetrical/'kind' — the convergence default"),
  hair: z.string().describe("away from silver swept back or bobbed"),
  agePosition: z.string().describe("the band's edges, not its middle"),
  build: z.string().describe("away from slim-average"),
  classRegister: z.string().describe("away from middle-class knitwear — this also filters the §14A wardrobe classes"),
  marker: z.string().describe("one per character, MANDATORY: gap tooth, cauliflower ear, port-wine mark, a finger that never straightened"),
  voice: z.string().describe("placed regional accent, never caricatured"),
  environment: z.string().describe("away from the tidy kitchen — §19's lived-in credibility rule"),
});

/** The gate: five of eight against every roster entry, proven. */
export const AxisClearance = z.object({
  against: z.string().describe("the roster entry being cleared against, or 'roster empty — first character'"),
  axesDiffering: z.array(z.string()),
  count: z.number().int(),
  passes: z.boolean().describe("five of eight or better"),
});

/** §22D's seven axes plus the two fields that carry the character under pressure. */
export const VoiceSpec = z.object({
  pitchBand: z.string(),
  placement: z.string().describe("chest, head, nasal colouring"),
  texture: z.string().describe("breath in the tone, rasp, dryness, clarity"),
  tempoAndRhythm: z.string().describe("speed AND pattern — steady vs stop-start"),
  melody: z.string().describe("flat vs swooping; where sentences land"),
  articulation: z.string().describe("consonant habits, softened or crisp, dropped sounds"),
  habits: z.string().describe("audible tics: the exhale before a hard claim, accelerating line ends"),
  ageWear: z.string().describe("named per character — a named wear cannot be rendered smooth"),
  stressRegister: z.string().describe("this voice's own version of emphasis, never generic intensity"),
  nonSpeechEvents: z.array(z.string()).describe("the two or three sounds this character makes; all others excluded"),
  rosterClearance: z.array(AxisClearance).describe("three-plus axes beyond accent, including against the generator's default"),
});

/** §20's constraint sheet — a short table, not prose. Built for every speaking character. */
export const ConstraintSheet = z.object({
  accent: z.string(),
  pacing: z.string(),
  postureRules: z.string(),
  restPosition: z.string().describe("must be inside the frame at the shot's framing"),
  gestureRegister: z.enum(["Restrained", "Continuous", "Economical"]),
  ocularDefault: z.string(),
  cameraRig: z.string(),
  audioProximity: z.string().describe("R2 or R3 signature — follows the rig"),
  wardrobeNeverList: z.array(z.string()).describe("forces placement-level beats off-narrator (§13)"),
  physicalNeverList: z.array(z.string()),
  eyeline: z.string(),
  mouthAsymmetry: z.string().describe("[MOUTH-CORNER] — which corner speech pulls to"),
});

/** §14A: the character's own class register, a subset of the six layers. */
export const WardrobeClasses = z.object({
  base: z.array(z.string()),
  mid: z.array(z.string()),
  outer: z.array(z.string()),
  lower: z.array(z.string()),
  foot: z.array(z.string()),
  accent: z.array(z.string()),
});

/** The fill for AVATAR-SHEET's slots. The locked text is pasted by code, not written here. */
export const SheetFill = z.object({
  sex: z.enum(["WOMAN", "MAN"]),
  face: z.string().describe("architecture in three or four plain sentences, the one marker, the asymmetries"),
  hair: z.string().describe("colour, roots, how worn — the same tone and the same height in every panel"),
  body: z.string().describe("build, height impression"),
  wardrobe: z.string().describe("BASE, LOWER, FOOT. Exposes the product's placement site where the build has worn beats (§9D)"),
  windowSide: z.string().describe("one side, used in all five panels — both profiles lit from the front is a reroll"),
  wallColour: z.string(),
  floor: z.string(),
  ageFeatures: z.string().describe("SKIN-A's [AGE-FEATURES]: the specific lines, creases, folds and freckling this face carries"),
});

export const CastMember = z.object({
  characterId: z.string().describe("C-01 for named cast, S-01 for recurring anonymous subjects"),
  name: z.string(),
  role: z.string(),
  isNarrator: z.boolean(),
  speaks: z.boolean().describe("silent recurrers get the sheet and axis table only — no voice, no constraint sheet"),
  beatCount: z.number().int().describe("from the step-2 phrase inventory, which is where recurrence is visible"),
  derivation: z.string().describe("the claim picks the life, the life picks the face and the voice — never invented"),
  axes: CharacterAxes,
  clearance: z.array(AxisClearance),
  voice: VoiceSpec.nullable(),
  constraintSheet: ConstraintSheet.nullable(),
  wardrobeClasses: WardrobeClasses,
  signatureItem: z.string().nullable().describe("exactly one garment per character may repeat, declared in advance"),
  sheetFill: SheetFill,
});

export const CastOutput = z.object({
  cast: z.array(CastMember),
  /** §14A: anonymous cast draw from a build-level pool, and their rows go in the same ledger. */
  genericClassPool: WardrobeClasses,
  oneOffSubjects: z.array(z.object({ phraseRef: z.string(), description: z.string() }))
    .describe("subjects appearing once — cast fresh per §13, never sheeted"),
  rosterNote: z.string().describe("what was cleared against, and whether the roster was empty"),
});

export type CastOutput = z.infer<typeof CastOutput>;

/* ------------------------------------------------------------------ *
 * Step 4 — property and locations (§30C, §30G, §22A)
 * ------------------------------------------------------------------ */

/** §30G field 2 — the finishes that repeat in every room. */
export const PropertyShell = z.object({
  wallFinishAndColour: z.string(),
  skirting: z.string().describe("profile, height, colour"),
  architrave: z.string(),
  internalDoorAndHandle: z.string().describe("style, colour, handle"),
  ceiling: z.string(),
  floorAndThreshold: z.string().describe("flooring and what it changes to at each threshold"),
  radiator: z.string(),
  switchesAndSockets: z.string(),
});

export const PropertySheet = z.object({
  dwellingId: z.string(),
  typeAndEra: z.string()
    .describe("field 1 — a BARE NOUN PHRASE naming the kind of house and its decade, e.g. '1930s bay-fronted semi-detached'. Not a sentence and NOT ending in the word 'house': the locked PLATE-PROP string reads 'the hall of a [TYPE AND ERA] house' and already supplies it"),
  shell: PropertyShell,
  floorMap: z.string().describe("field 3 — which room adjoins which, where the stairs land, which way the front door faces"),
  orientation: z.array(z.object({ room: z.string(), windowsFace: z.string() }))
    .describe("field 4 — does the most work: it reconciles the §22A profiles instead of leaving them to differ by taste"),
  carriedElements: z.array(z.string()).describe("field 5 — three to five objects visible in more than one location"),
  exterior: z.string().describe("field 6 — front elevation, garden, fence, and what each room's window looks out at"),
  standingNegatives: z.array(z.string()).describe("field 7 — accumulated from observed failures, dated"),
  /** Named in one clause for PROP-REF. */
  carriedFinishes: z.string(),
  lightingProfile: z.string().describe("the property's daylight profile for the plate"),
});

export const LocationSheet = z.object({
  property: z.string().describe("part 1 — which dwelling, which side the windows face, which rooms adjoin, what is visible through each opening. Read off the Property Sheet, never decided here"),
  geometry: z.string().describe("part 2 — window wall, door, room shape, in ABSOLUTE ROOM TERMS"),
  fixedDressingAndAnchors: z.string().describe("part 3"),
  looseProps: z.array(z.object({ prop: z.string(), state: z.string() })).describe("part 4 — each with its current state"),
  paletteAndMaterials: z.string().describe("part 5"),
  lightingProfile: z.string().describe("part 6 — the §22A five elements"),
});

export const DerivedLocation = z.object({
  locationId: z.string(),
  name: z.string(),
  tier: z.enum(["PLATED", "INCIDENTAL", "TRAVERSED"])
    .describe("PLATED at two or more beats in one spot; INCIDENTAL at one; TRAVERSED where the subject moves through rather than staying"),
  channel: z.string().describe("which of C0-C8 surfaced it"),
  beatCount: z.number().int(),
  ownership: z.enum(["STORY", "GENERIC"]),
  dwellingId: z.string().nullable().describe("null where the location stands alone rather than being a room of the dwelling"),
  sheet: LocationSheet,
  anchors: z.array(z.string()).describe("three to five named, distinctive, immovable objects. PLATED only"),
  geoLine: z.string().nullable().describe("TRAVERSED only — the sequence's axis and travel direction"),
  landmark: z.string().nullable().describe("TRAVERSED only — one thing the eye carries across the beats"),
  roomDescription: z.string().nullable().describe("the plate's fill: geometry, fixed dressing and named anchors. PLATED only"),
});

export const LocationOutput = z.object({
  properties: z.array(PropertySheet).describe("empty unless two or more locations are rooms of one dwelling"),
  locations: z.array(DerivedLocation),
  setChecks: z.object({
    s1: z.string().describe("beat count and movement decide the tier"),
    s2: z.string().describe("most locations daylight; at most one evening, and it earns that with a lamp in frame"),
    s3: z.string().describe("profiles reconciled to orientation, not merely varied"),
    s4: z.string().describe("consecutive acts do not share a room"),
  }),
  derivationNote: z.string().describe("C0 ran first; what it found"),
});

export type LocationOutput = z.infer<typeof LocationOutput>;

/* ------------------------------------------------------------------ *
 * Step 5 — act map and wardrobe map (§14A, §21, §27B, §30A, §30B, E4)
 * ------------------------------------------------------------------ */

/** §14A's six-layer stack. A wardrobe entry is a stack, not an outfit description. */
export const GarmentStack = z.object({
  base: z.string().describe("compulsory — most beats sit at chest-up framing and the base layer is what reads"),
  mid: z.string().nullable(),
  outer: z.string().nullable(),
  lower: z.string(),
  foot: z.string(),
  accent: z.string().nullable(),
});

export const StoryDay = z.object({
  day: z.string().describe("D-01, D-02..."),
  act: z.string().nullable(),
  channel: z.string().describe("which of D1-D5 surfaced it"),
  subject: z.string().describe("character id, or a GENERIC subject id"),
  outfit: GarmentStack,
  colourFamily: z.enum([
    "warm neutral", "cool neutral", "earth", "navy/denim",
    "red family", "green family", "monochrome", "pattern-led",
  ]),
});

export const CaptureEvent = z.object({
  eventId: z.string(),
  storyDay: z.string(),
  locationId: z.string(),
  visibility: z.enum(["CONCEALED", "VISIBLE", "REVEAL"])
    .describe("the LOWER layer decides this; wardrobe is never modified to expose the product (§9D)"),
  alibi: z.string().describe("the §30B capture alibi — why this footage exists"),
  beats: z.array(z.string()),
});

/** E4's act-map row. */
export const ActMapRow = z.object({
  beatId: z.string(),
  ordinal: z.number().int(),
  act: z.string(),
  phraseIds: z.array(z.string()),
  type: z.enum(["TH", "BR", "MECH", "PRODUCT", "CTA"]),
  register: z.string(),
  rig: z.string().describe("§22B — no beat type is exempt"),
  frameSide: z.string(),
  framingStep: z.string(),
  energy: z.enum(["calm", "lift", "stab"]),
  valence: z.enum(["pos", "neg", "neutral"]),
  ownership: z.enum(["STORY", "GENERIC"]),
  function: z.string().describe("the §30B function — function before subject"),
  subject: z.string(),
  alibi: z.string(),
  locationId: z.string(),
  /** Both mandatory on every row (E4, added V7.48.8). */
  storyDay: z.string(),
  captureEventId: z.string(),
  sequenceId: z.string().nullable(),
  geoLineRef: z.string().nullable(),
  wardrobeRef: z.string(),
  duration: z.number().int().describe("from the E6 function, never 'auto'"),
  productState: z.enum(["absent", "worn", "held", "seated", "demo"]),
  visibility: z.enum(["CONCEALED", "VISIBLE", "REVEAL"]).nullable(),
  claims: z.array(z.string()),
  plantPayoff: z.string().nullable(),
  notes: z.string().nullable(),
});

export const MapsOutput = z.object({
  storyDays: z.array(StoryDay),
  captureEvents: z.array(CaptureEvent),
  actMap: z.array(ActMapRow),
  /** §14A's four audits. A map delivered without them is undelivered. */
  wardrobeAudits: z.object({
    w1: z.object({ pass: z.boolean(), detail: z.string() }).describe("class repetition — counted over story days, narrator and anonymous cast together"),
    w2: z.object({ pass: z.boolean(), detail: z.string() }).describe("change depth — two layers including BASE between consecutive days"),
    w3: z.object({ pass: z.boolean(), detail: z.string() }).describe("colour rotation"),
    w4: z.object({ pass: z.boolean(), detail: z.string() }).describe("day coverage — every event resolves to a day, every day to exactly one outfit row"),
  }),
  /** §27B's reconciliation. Uncovered must read zero. */
  coverage: z.object({
    phraseCount: z.number().int(),
    covered: z.number().int(),
    uncovered: z.number().int().describe("an uncovered count above zero is an undelivered act"),
    blocked: z.number().int().describe("reported, never resolved — it sits until the advertiser moves it"),
    merged: z.number().int(),
    thCarried: z.number().int(),
    unpaidPlants: z.array(z.string()),
    reconciliationLine: z.string(),
  }),
  dispositions: z.array(z.object({
    phraseId: z.string(),
    disposition: z.string().describe("BR-xx | TH-xx | MECH-xx | MERGED→P-0xx | BLOCKED"),
    demo: z.string().nullable().describe("FLEX/STRETCH/ANCHOR/LOAD/SEAT/SIDE-BY-SIDE/TURN, or the one-line reason none can"),
    blockedReason: z.string().nullable(),
  })),
});

export type MapsOutput = z.infer<typeof MapsOutput>;
