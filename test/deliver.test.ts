import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Rendering, end to end, over a seeded build.
 *
 * §16A routes each artefact class to one widget type, and a deliverable "the
 * user cannot reach in one action is undelivered". This seeds what steps 2-5
 * actually write and checks the routing holds and the files stand alone.
 */

const root = await mkdtemp(join(tmpdir(), "ai-ads-deliver-"));
process.env.BUILDS_ROOT = root;

const { createBuild, putArtifact, paths } = await import("../src/store");
const { actMap, characters, claims, locations, locks, phrases, generationJobs } =
  await import("../src/store/collections");
const { renderBuild } = await import("../src/delivery/render");

const SLUG = "seeded";

async function seed(): Promise<void> {
  await createBuild(SLUG, "Seeded build", "7.51.3");

  await putArtifact(SLUG, "script_absorption", {
    modeLock: { mode: "Mode 1 Realistic", reason: "the reference reads realistic (§22)", hybridByAct: [] },
    modelRoutes: [
      { beatClass: "Talking-head seeds", model: "gpt_image_2_5", variant: "sunburst", quality: "high", resolution: "2k", reason: "faces at medium-close" },
      { beatClass: "Volume B-roll", model: "nano_banana_2", variant: null, quality: "high", resolution: "2k", reason: "no critical type" },
    ],
    locks: [], collisions: [],
    productSheet: { status: "created", fields: [{ field: "Product name", value: "Test Band", gap: null }] },
    placementLock: { present: true, site: "[SITE]", landmark: "[LANDMARK]", offset: "2cm", consequence: "REVEAL beats unblocked" },
    reconciliation: { phraseCount: 2, claimsByTier: { tier1: 1, tier2: 0, tier3: 1 }, blockedCount: 1, collisionCount: 0, note: "2 phrases, 0 uncovered." },
    phraseInventory: [], claims: [],
  });

  await phrases(SLUG).replaceAll([
    { phraseId: "P-001", ordinal: 1, text: "It just stopped hurting.", splitTrigger: "sentence", structuralJob: "hook", actHint: "Act 1", disposition: "BR-01" },
    { phraseId: "P-002", ordinal: 2, text: "Try it today.", splitTrigger: "sentence", structuralJob: "close", actHint: "Act 1", disposition: null },
  ]);

  await claims(SLUG).replaceAll([
    { text: "93% saw relief", tier: 3, kind: "numeric", source: null, qualification: null, phraseRef: "P-001", consequence: "BLOCKED pending an advertiser decision" },
  ]);

  await locks(SLUG).replaceAll([{ key: "camera", value: "iPhone 17 Pro Max", section: "22", reason: "Mode 1 lock" }]);

  await characters(SLUG).replaceAll([
    { characterId: "C-01", name: "Narrator", role: "narrator", isNarrator: true, speaks: true, beatCount: 12,
      axes: {
        faceArchitecture: "long", hair: "silver, short", agePosition: "early 60s", build: "slight",
        classRegister: "practical", marker: "reading glasses", voice: "dry rasp", environment: "domestic",
      },
      clearance: [{ against: "C-00", axesDiffering: ["age", "build"], count: 2, passes: true }],
      wardrobeClasses: { base: ["tee"], mid: [], outer: ["cardigan"], lower: ["jeans"], foot: ["trainers"], accent: [] },
      signatureItem: null,
      sheetFill: {
        sex: "WOMAN", face: "long", hair: "silver, short", body: "slight", wardrobe: "marl tee",
        windowSide: "left", wallColour: "off-white", floor: "oak", ageFeatures: "early sixties",
      },
      derivation: "named in P-001 and P-002; 22 beats on the step-2 inventory",
      voice: null, constraintSheet: null,
      slug: SLUG, sheetStatus: "locked", sheetJobId: "job-c01" },
  ]);

  await locations(SLUG).replaceAll([
    { locationId: "L-01", name: "Kitchen", tier: "PLATED", channel: "C0", beatCount: 6, ownership: "STORY",
      dwellingId: "D-01", sheet: {
        property: "D-01", geometry: "galley, 3m x 4m", fixedDressingAndAnchors: "window left, range hood, wall clock",
        looseProps: [{ prop: "kettle", state: "on the hob" }], paletteAndMaterials: "oak, off-white",
        lightingProfile: "window left, morning",
      }, anchors: ["window", "range"],
      geoLine: "camera south", landmark: null, roomDescription: "a kitchen", plateStatus: "locked" },
    { locationId: "L-02", name: "Hallway", tier: "PLATED", channel: "C0", beatCount: 2, ownership: "STORY",
      dwellingId: "D-02", sheet: {
        property: "D-02", geometry: "narrow, 1m x 5m", fixedDressingAndAnchors: "front door, stair foot",
        looseProps: [], paletteAndMaterials: "magnolia", lightingProfile: "borrowed light only",
      }, anchors: [], geoLine: null, landmark: null, roomDescription: "a hallway",
      plateStatus: "held_property_plate_failed" },
  ]);

  await generationJobs(SLUG).replaceAll([
    { key: "avatar_sheet:C-01", purpose: "avatar_sheet", ref: "C-01", label: "C-01 · Narrator", batchIndex: 0,
      model: "gpt_image_2_5", params: { variant: "sunburst", quality: "high", resolution: "2k", aspect_ratio: "9:16" },
      prompt: "AVATAR SHEET\nFive panels.\nNEGATIVES: no retouching", jobId: "job-c01", status: "completed",
      loggedModel: "gpt_image_2_5", resultUrls: ["https://example.invalid/a.png"], attempts: 1, failures: [],
      createdAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
  ]);

  await actMap(SLUG).replaceAll([
    { beatId: "A1-BR-01", ordinal: 1, act: "Act 1", phraseIds: ["P-001"], type: "BR", register: "documentation",
      rig: "R1", frameSide: "left", framingStep: "medium", energy: "stab", valence: "neg", ownership: "STORY",
      function: "MECHANISM", subject: "C-01", alibi: "making coffee", locationId: "L-01", storyDay: "day-1",
      captureEventId: "E-01", sequenceId: "S-01", geoLineRef: null, wardrobeRef: "day-1", duration: 5,
      productState: "worn", visibility: "CONCEALED", claims: [], plantPayoff: null, notes: null },
  ]);

  await putArtifact(SLUG, "maps", {
    storyDays: [{ day: "day-1", act: "Act 1", channel: "C1", subject: "C-01",
      outfit: { base: "tee", mid: null, outer: "cardigan", lower: "jeans", foot: "trainers", accent: null },
      colourFamily: "warm neutral" }],
    captureEvents: [{ eventId: "E-01", storyDay: "day-1", locationId: "L-01", visibility: "CONCEALED", alibi: "making coffee", beats: ["A1-BR-01"] }],
    actMap: [], dispositions: [],
    wardrobeAudits: {
      w1: { pass: true, detail: "no class repeats across days" },
      w2: { pass: true, detail: "two layers change" },
      w3: { pass: true, detail: "colour rotates" },
      w4: { pass: false, detail: "day-2 has no outfit row" },
    },
    coverage: { phraseCount: 2, covered: 1, uncovered: 1, blocked: 1, merged: 0, thCarried: 0,
      unpaidPlants: [], reconciliationLine: "2 phrases · 1 covered · 1 uncovered · 1 blocked" },
  });
}

await seed();
const files = await renderBuild(SLUG);

test("every artefact that exists is routed to a deliverable", () => {
  const names = files.map((file) => file.path.split("/").pop());
  assert.ok(names.includes("index.html"));
  assert.ok(names.includes("step-2-locks.html"));
  assert.ok(names.includes("coverage.html"));
  assert.ok(names.includes("cast.html"));
  assert.ok(names.includes("locations.html"));
  assert.ok(names.includes("act-map.html"));
  assert.ok(names.includes("wardrobe.html"));
});

test("the §18A lock ships as a ledger — one row per beat class with its reason", async () => {
  const html = await readFile(join(paths(SLUG).deliveries, "step-2-locks.html"), "utf8");
  assert.match(html, /Talking-head seeds/);
  assert.match(html, /gpt_image_2_5/);
  assert.match(html, /sunburst · high · 2k/);
  assert.match(html, /faces at medium-close/);
});

test("a tier 3 claim carries its warning and its consequence", async () => {
  // §43A: tier 3 means the beat is BLOCKED — never rewritten, never cut.
  const html = await readFile(join(paths(SLUG).deliveries, "step-2-locks.html"), "utf8");
  assert.match(html, /⚠ Tier 3/);
  assert.match(html, /BLOCKED pending an advertiser decision/);
});

test("the uncovered count is on the deliverable that carries it", async () => {
  // §27B: an uncovered count above zero is an undelivered act.
  const html = await readFile(join(paths(SLUG).deliveries, "coverage.html"), "utf8");
  assert.match(html, /uncovered/);
  assert.match(html, /2 phrases · 1 covered · 1 uncovered · 1 blocked/);
});

test("a held room says so, with the §30G reason", async () => {
  const html = await readFile(join(paths(SLUG).deliveries, "locations.html"), "utf8");
  assert.match(html, /held_property_plate_failed/);
  assert.match(html, /six houses/);
});

test("the wardrobe map ships with its four audits, including the failing one", async () => {
  // §14A: "a map delivered without its audits is undelivered."
  const html = await readFile(join(paths(SLUG).deliveries, "wardrobe.html"), "utf8");
  assert.match(html, /W1/);
  assert.match(html, /W4/);
  assert.match(html, /day-2 has no outfit row/);
});

test("the sheet prompt is copyable raw and its count is not baked in", async () => {
  const html = await readFile(join(paths(SLUG).deliveries, "cast.html"), "utf8");
  const raw = "AVATAR SHEET\nFive panels.\nNEGATIVES: no retouching";
  assert.equal(html.includes(`${raw.replace(/\n/g, "").length} chars`), false);
  assert.match(html, /carousel-data/);
});

test("every deliverable is self-contained", async () => {
  for (const file of files) {
    const html = await readFile(file.path, "utf8");
    assert.equal(/src="http/.test(html), false, `${file.path} fetches a script`);
    assert.equal(/@import/.test(html), false, `${file.path} imports a stylesheet`);
  }
});
