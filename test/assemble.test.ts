import { test } from "node:test";
import assert from "node:assert/strict";
import { locked, assembleAvatarSheet, assemblePropertyPlate, assembleLocationPlate, UnfilledSlotError } from "../src/generation/assemble";
import { getString } from "../src/standards/registry";

const SHEET_FILL = {
  sex: "MAN",
  face: "A broad, heavy-jawed face with deep-set eyes and a nose broken once to the left. One marker: a gap between the front teeth.",
  hair: "Cropped white curls, thinning at the crown, the same tone in every panel.",
  body: "Heavyset and barrel-chested, about five foot nine.",
  wardrobe: "A navy check flannel shirt, work trousers, brown work boots.",
  windowSide: "the left",
  wallColour: "a flat pale grey",
  floor: "bare pine boards",
  ageFeatures: "deep nasolabial folds, a broken capillary across the left cheek",
};

const PROPERTY = {
  typeAndEra: "a 1930s semi-detached house",
  wallFinishAndColour: "matt emulsion in a warm off-white",
  skirting: "torus profile, 120mm, gloss white",
  architrave: "matching torus, gloss white",
  internalDoorAndHandle: "four-panel painted door, chrome lever handle",
  ceiling: "flat white, plain",
  floorAndThreshold: "oak boards, changing to grey tile at the kitchen threshold",
  radiator: "single-panel white radiator",
  switchesAndSockets: "white plastic, square edges",
  lightingProfile: "Daylight through the door glass only, mid-morning.",
  carriedFinishes: "the same off-white walls, torus skirting and four-panel doors",
};

test("locked() substitutes a slot and returns the verbatim body otherwise", () => {
  const filled = locked("PROP-REF", { "THE CARRIED FINISHES, NAMED IN ONE CLAUSE": "the same oak boards" });
  assert.match(filled, /the same oak boards/);
  assert.doesNotMatch(filled, /\[/, "no bracket may survive substitution");
});

test("locked() throws rather than shipping an unfilled slot", () => {
  // E5: an unfilled slot ships a literal bracket into the prompt.
  assert.throws(() => locked("PROP-REF"), UnfilledSlotError);
});

test("slot matching ignores punctuation and case", () => {
  // The document writes the same slot as [SKIRTING] and
  // [SKIRTING — profile, height, colour] in different strings.
  const filled = locked("PROP-SHELL", {
    "WALL FINISH AND COLOUR": "a", "SKIRTING": "b", "ARCHITRAVE": "c",
    "INTERNAL DOOR AND HANDLE": "d", "CEILING": "e", "FLOOR AND THRESHOLD": "f",
    "RADIATOR": "g", "SWITCHES AND SOCKETS": "h",
  });
  assert.doesNotMatch(filled, /\[/);
});

test("the avatar sheet pastes CAM-LOCK, AVATAR-SHEET and SHEET-GRID verbatim", () => {
  const prompt = assembleAvatarSheet(SHEET_FILL);

  for (const id of ["CAM-LOCK", "SHEET-GRID", "NEG-SHEET", "NEG-DEFAULT-FACE"]) {
    const body = getString(id)!.text.trim();
    assert.ok(prompt.includes(body), `${id} must appear verbatim, untrimmed`);
  }
  // §19's never-trimmed clauses.
  assert.match(prompt, /no window changing sides between panels/);
  assert.match(prompt, /THE GRID, EXACTLY/);
  assert.match(prompt, /^NEGATIVES: /m);
  assert.doesNotMatch(prompt, /\[/);
});

test("the property plate follows §30G's stated assembly order", () => {
  const prompt = assemblePropertyPlate(PROPERTY);
  // Anchored on fragments that survive slot substitution — PLATE-PROP's own
  // opening carries [TYPE AND ERA], so its raw text is not in the output.
  const order = [
    "Shot on an iPhone 17 Pro Max",              // CAM-LOCK
    "taken from just inside the front door",     // PLATE-PROP
    "Capture must look like a phone camera file", // CAP-A
    "THIS IS A FILE, NOT A PICTURE",             // CAP-FILE
  ].map((fragment) => prompt.indexOf(fragment));
  assert.ok(order.every((i) => i >= 0), `every block present, got ${JSON.stringify(order)}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "blocks in the stated order");
  assert.match(prompt, /NEGATIVES: .*no different house/s);
});

test("a location plate in the dwelling carries PROP-REF and PROP-SHELL; a standalone one does not", () => {
  const inHouse = assembleLocationPlate({
    roomDescription: "The kitchen, with the beige wingback by the window.",
    lightingProfile: "Broad window light from the south side.",
    property: PROPERTY,
  });
  assert.match(inHouse, /THE SAME HOUSE/);
  assert.match(inHouse, /Shared through the whole house/);
  assert.match(inHouse, /no different house/);

  const standalone = assembleLocationPlate({
    roomDescription: "A public park bench.",
    lightingProfile: "Overcast.",
    property: null,
  });
  assert.doesNotMatch(standalone, /THE SAME HOUSE/);
  // §30G is scoped to dwellings; NEG-PROP has nothing to guard on a standalone location.
  assert.doesNotMatch(standalone, /no different house/);
});

test("PROP-SHELL's one-standard-of-upkeep clause is never trimmed", () => {
  const prompt = assembleLocationPlate({
    roomDescription: "x", lightingProfile: "y", property: PROPERTY,
  });
  assert.match(prompt, /One age of building, one decade of decoration, one standard/);
});

test("both [SIDE] slots take the same value — a re-lit panel is the reroll tell", () => {
  // §19: "the window stays on the same side in all five panels... Both
  // profiles lit from the front is the tell that the model re-lit each panel."
  const prompt = assembleAvatarSheet(SHEET_FILL);
  const occurrences = prompt.split("the left").length - 1;
  assert.ok(occurrences >= 2, `expected the window side to appear twice, saw ${occurrences}`);
});

test("head-term matching resolves a slot spelled two ways across strings", () => {
  // PLATE-PROP writes [SKIRTING]; PROP-SHELL writes
  // [SKIRTING — profile, height, colour]. E5 treats them as one slot.
  const shell = locked("PROP-SHELL", {
    "WALL FINISH AND COLOUR": "a", "SKIRTING": "b", "ARCHITRAVE": "c",
    "INTERNAL DOOR AND HANDLE": "d", "CEILING": "e", "FLOOR AND THRESHOLD": "f",
    "RADIATOR": "g", "SWITCHES AND SOCKETS": "h",
  });
  assert.doesNotMatch(shell, /\[/);
});
