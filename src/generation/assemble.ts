/**
 * Prompt assembly from the locked string library.
 *
 * The division of labour matters and is the reason this file exists. Appendix A
 * strings are NORMATIVE — "copy this verbatim or with only the named
 * substitutions" — and several carry a "never trimmed" clause naming the exact
 * sentence that must survive. A model asked to write the prompt paraphrases
 * them; every paraphrase is a silent trim of a tested string.
 *
 * So the model supplies only the *fills* — the face, the room, the shell — and
 * the code pastes the locked text around them in the assembly order the
 * relevant section states. Each assembly order below is quoted from its section.
 */

import { getString } from "@/standards/registry";

export class MissingStringError extends Error {
  constructor(id: string) {
    super(`Appendix A string "${id}" is not defined. A prompt cannot be assembled without it.`);
    this.name = "MissingStringError";
  }
}

export class UnfilledSlotError extends Error {
  constructor(public readonly slots: string[], public readonly stringId: string) {
    super(
      `${stringId} still carries unfilled slots after substitution: ${slots.join(", ")}. ` +
        `An unfilled slot ships a literal bracket into the prompt (E5).`,
    );
    this.name = "UnfilledSlotError";
  }
}

/** A slot token as Appendix A writes them: [SITE], [WALL FINISH AND COLOUR]. */
const SLOT = /\[([^\]]+)\]/g;

/**
 * Fetch a locked string and substitute its slots.
 *
 * Slot tokens are not spelled consistently across the library — the same
 * source value is written `[SKIRTING]` in `PLATE-PROP` and
 * `[SKIRTING — profile, height, colour]` in `PROP-SHELL`, `[RADIATOR]` in one
 * and `[RADIATOR TYPE]` in the other, `[FLOOR AND WHAT IT CHANGES TO AT THE
 * THRESHOLD]` against `[FLOOR, AND WHAT IT CHANGES TO AT THE THRESHOLD]`.
 *
 * E5 treats each of those as ONE slot with one source (Property Sheet field
 * 2), so resolution tries three increasingly forgiving passes rather than
 * making every caller reproduce the punctuation of every spelling.
 */
export function locked(id: string, fills: Record<string, string> = {}): string {
  const string = getString(id);
  if (!string) throw new MissingStringError(id);

  const entries = Object.entries(fills).map(([key, value]) => ({
    exact: normaliseSlot(key),
    head: headTerm(key),
    value,
  }));

  const filled = string.text.replace(SLOT, (match, token: string) => {
    const resolved = resolveFill(token, entries);
    return resolved ?? match;
  });

  const remaining = [...filled.matchAll(SLOT)].map((m) => m[0]);
  if (remaining.length) throw new UnfilledSlotError(remaining, id);

  return filled;
}

interface FillEntry {
  exact: string;
  head: string;
  value: string;
}

function resolveFill(token: string, entries: FillEntry[]): string | null {
  const exact = normaliseSlot(token);
  const head = headTerm(token);

  // 1. Exact, normalised.
  const direct = entries.find((e) => e.exact === exact);
  if (direct) return direct.value;

  // 2. Head term — the part before the first em-dash or comma.
  const byHead = entries.find((e) => e.head === head);
  if (byHead) return byHead.value;

  // 3. Word-prefix: a fill keyed "radiator" answers the slot "radiator type".
  //    Longest key wins, so a more specific fill is never shadowed by a
  //    shorter one that also prefixes the slot.
  const candidates = entries
    .filter(
      (e) =>
        isWordPrefix(e.exact, exact) ||
        isWordPrefix(e.head, head) ||
        isWordPrefix(head, e.exact),
    )
    .sort((a, b) => b.exact.length - a.exact.length);

  return candidates[0]?.value ?? null;
}

function normaliseSlot(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The part of a slot before its first em-dash or comma: "SKIRTING — profile" → "skirting". */
function headTerm(token: string): string {
  return normaliseSlot(token.split(/[\u2014\u2013,]/)[0]);
}

function isWordPrefix(prefix: string, full: string): boolean {
  if (!prefix || !full) return false;
  if (prefix === full) return true;
  return full.startsWith(prefix + " ");
}

/** Join prompt sections, dropping empties, with one blank line between. */
function compose(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n");
}

/**
 * Negatives are appended as one line opening with the NEGATIVES: token, which
 * is what §16A's highlighter splits on and what §5 warns must never name a
 * prohibited concept positively.
 */
function negatives(ids: string[], extra: string[] = []): string {
  const parts = ids.map((id) => {
    const s = getString(id);
    if (!s) throw new MissingStringError(id);
    return s.text.trim();
  });
  return `NEGATIVES: ${[...parts, ...extra].join(", ")}`;
}

/* ------------------------------------------------------------------ *
 * §19 — the avatar / character reference sheet
 * ------------------------------------------------------------------ */

export interface AvatarSheetFill {
  /** "WOMAN" or "MAN" — AVATAR-SHEET's [WOMAN/MAN]. */
  sex: string;
  /** Architecture in three or four plain sentences, the one §19A marker, the asymmetries. */
  face: string;
  /** Colour, roots, how worn — the same tone and the same height in every panel. */
  hair: string;
  /** Build and height impression. */
  body: string;
  /**
   * BASE, LOWER, FOOT. §19: the sheet's wardrobe exposes the product's
   * placement site where the build has worn beats, so the sheet doubles as
   * the body reference for placement (§9D).
   */
  wardrobe: string;
  /**
   * Which side the window sits on. AVATAR-SHEET carries [SIDE] twice and both
   * must be the same value — "the window stays on the same side in all five
   * panels", and both profiles lit from the front is the reroll tell.
   */
  windowSide: string;
  wallColour: string;
  floor: string;
  /** §22S SKIN-A's [AGE-FEATURES]: the specific lines, creases and freckling. */
  ageFeatures: string;
}

/**
 * §19: "Prose only, nothing attached, one generation." `AVATAR-SHEET` carries
 * the sameness clauses and the light rule; `SHEET-GRID` is the layout block and
 * "is pasted verbatim on every sheet" because "a layout described by content
 * leaves the model free to pick its own scale per panel, and it did."
 *
 * §44.31 makes `CAM-LOCK` open every Mode 1 T2I with the capture stack
 * mandatory alongside it, and §19A appends `NEG-DEFAULT-FACE` to every new
 * reference-sheet T2I.
 */
export function assembleAvatarSheet(fill: AvatarSheetFill): string {
  return compose([
    locked("CAM-LOCK"),
    locked("AVATAR-SHEET", {
      "WOMAN/MAN": fill.sex,
      "FACE": fill.face,
      "HAIR": fill.hair,
      "BODY": fill.body,
      "WARDROBE": fill.wardrobe,
      // Both [SIDE] slots take the same value by design, not by accident.
      "SIDE": fill.windowSide,
      "WALL COLOUR": fill.wallColour,
      "FLOOR": fill.floor,
    }),
    locked("SHEET-GRID"),
    lockedIfSlotless("SKIN-A", { "AGE-FEATURES": fill.ageFeatures }),
    locked("CAP-A"),
    locked("CAP-FILE"),
    // "skin at test strength in the close-up" — CAP-SHARP is mandatory where
    // skin is close (§44.31), and the close-up panel is exactly that.
    lockedIfSlotless("CAP-SHARP"),
    negatives(["NEG-SHEET", "NEG-DEFAULT-FACE"]),
  ]);
}

/* ------------------------------------------------------------------ *
 * §30G — the property plate
 * ------------------------------------------------------------------ */

export interface PropertyPlateFill {
  typeAndEra: string;
  wallFinishAndColour: string;
  skirting: string;
  architrave: string;
  internalDoorAndHandle: string;
  ceiling: string;
  floorAndThreshold: string;
  radiator: string;
  switchesAndSockets: string;
  /** The property's own daylight profile, per §22A. */
  lightingProfile: string;
}

/**
 * §30G assembly, stated verbatim in the section:
 * "CAM-LOCK → PLATE-PROP → the property's daylight profile → PHYS-FRAME-C →
 *  CAP-A → CAP-FILE → negatives carrying NEG-PROP + NEG-SCENE + NEG-M1."
 *
 * "Empty — no people, no product, nothing staged."
 */
export function assemblePropertyPlate(fill: PropertyPlateFill): string {
  const shellFills = propertyShellFills(fill);
  return compose([
    locked("CAM-LOCK"),
    locked("PLATE-PROP", { "TYPE AND ERA": fill.typeAndEra, ...shellFills }),
    fill.lightingProfile,
    lockedIfSlotless("PHYS-FRAME-C"),
    locked("CAP-A"),
    locked("CAP-FILE"),
    negatives(["NEG-PROP", "NEG-SCENE", "NEG-M1"]),
  ]);
}

function propertyShellFills(fill: PropertyPlateFill): Record<string, string> {
  return {
    "WALL FINISH AND COLOUR": fill.wallFinishAndColour,
    "SKIRTING": fill.skirting,
    "SKIRTING — profile, height, colour": fill.skirting,
    "ARCHITRAVE": fill.architrave,
    "INTERNAL DOOR AND HANDLE": fill.internalDoorAndHandle,
    "INTERNAL DOOR — style, colour, handle": fill.internalDoorAndHandle,
    "CEILING": fill.ceiling,
    "FLOOR AND THRESHOLD": fill.floorAndThreshold,
    "FLOOR, AND WHAT IT CHANGES TO AT THE THRESHOLD": fill.floorAndThreshold,
    "RADIATOR": fill.radiator,
    "RADIATOR TYPE": fill.radiator,
    "SWITCHES AND SOCKETS": fill.switchesAndSockets,
  };
}

/* ------------------------------------------------------------------ *
 * §30C — the location (scene) plate
 * ------------------------------------------------------------------ */

export interface LocationPlateFill {
  /** Room geometry, fixed dressing and the three to five named anchors. */
  roomDescription: string;
  /** The location's §22A lighting profile. */
  lightingProfile: string;
  /** Present where this room belongs to the build's dwelling (§30G chain). */
  property?: (PropertyPlateFill & { carriedFinishes: string }) | null;
}

/**
 * §30C assembly, stated verbatim:
 * "CAM-LOCK → PROP-REF + PROP-SHELL with the property plate attached where the
 *  room belongs to the build's dwelling (§30G) → the room's geometry, fixed
 *  dressing and named anchors → the location's §22A profile → PHYS-FRAME-C →
 *  CAP-A → CAP-FILE → negatives carrying NEG-SCENE + NEG-PROP + NEG-M1."
 *
 * "Empty — no people, no product, nothing staged, exactly as the property
 * plate is. A plate with a person in it re-injects that person into every beat
 * built against it."
 */
export function assembleLocationPlate(fill: LocationPlateFill): string {
  const property = fill.property;
  return compose([
    locked("CAM-LOCK"),
    property ? locked("PROP-REF", { "THE CARRIED FINISHES, NAMED IN ONE CLAUSE": property.carriedFinishes }) : null,
    property ? locked("PROP-SHELL", propertyShellFills(property)) : null,
    fill.roomDescription,
    fill.lightingProfile,
    lockedIfSlotless("PHYS-FRAME-C"),
    locked("CAP-A"),
    locked("CAP-FILE"),
    negatives(property ? ["NEG-SCENE", "NEG-PROP", "NEG-M1"] : ["NEG-SCENE", "NEG-M1"]),
  ]);
}

/**
 * Include a locked string only where every slot it carries has been filled.
 *
 * Some strings in the capture and skin stacks carry build-specific slots that
 * are not resolved until a beat is written. Dropping such a string from a
 * plate is correct — including it with literal brackets is not — but a string
 * with no slots at all is always included.
 */
function lockedIfSlotless(id: string, fills: Record<string, string> = {}): string | null {
  try {
    return locked(id, fills);
  } catch (error) {
    if (error instanceof UnfilledSlotError || error instanceof MissingStringError) return null;
    throw error;
  }
}

/** §16B's label: stated immediately above every call, never after it. */
export function callLabel(ref: string, description: string, model: string, params: Record<string, unknown>): string {
  const paramText = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  return `${ref} · ${description} · ${model} ${paramText}`;
}
