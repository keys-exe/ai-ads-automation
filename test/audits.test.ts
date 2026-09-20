import { test } from "node:test";
import assert from "node:assert/strict";
import { auditMaps } from "../src/processes/maps";
import { buildImageCall, verifyLoggedModel, RetiredModelError, AliasMismatchError } from "../src/generation/arsenal";
import type { MapsOutput } from "../src/processes/schemas-cast";

const outfit = (base: string, lower = "jeans", foot = "trainers") => ({
  base, mid: null, outer: null, lower, foot, accent: null,
});

function maps(overrides: Partial<MapsOutput> = {}): MapsOutput {
  const base: MapsOutput = {
    storyDays: [
      { day: "D-01", act: "A1", channel: "D2", subject: "C-01", outfit: outfit("check flannel shirt"), colourFamily: "earth" },
      { day: "D-02", act: "A2", channel: "D2", subject: "C-01", outfit: outfit("polo shirt", "cords", "work boots"), colourFamily: "navy/denim" },
    ],
    captureEvents: [
      { eventId: "E-01", storyDay: "D-01", locationId: "LOC-01", visibility: "CONCEALED", alibi: "filming a how-to", beats: ["BR-01"] },
    ],
    actMap: [
      {
        beatId: "BR-01", ordinal: 1, act: "A1", phraseIds: ["P-001"], type: "BR",
        register: "documentary", rig: "R1", frameSide: "left", framingStep: "medium",
        energy: "calm", valence: "neutral", ownership: "STORY", function: "ESTABLISH",
        subject: "C-01", alibi: "filming a how-to", locationId: "LOC-01",
        storyDay: "D-01", captureEventId: "E-01", sequenceId: null, geoLineRef: null,
        wardrobeRef: "D-01", duration: 5, productState: "absent", visibility: "CONCEALED",
        claims: [], plantPayoff: null, notes: null,
      },
    ],
    wardrobeAudits: {
      w1: { pass: true, detail: "" }, w2: { pass: true, detail: "" },
      w3: { pass: true, detail: "" }, w4: { pass: true, detail: "" },
    },
    coverage: {
      phraseCount: 1, covered: 1, uncovered: 0, blocked: 0, merged: 0,
      thCarried: 0, unpaidPlants: [], reconciliationLine: "P-001 → 1 beat",
    },
    dispositions: [{ phraseId: "P-001", disposition: "BR-01", demo: null, blockedReason: null }],
  };
  return { ...base, ...overrides };
}

const find = (findings: ReturnType<typeof auditMaps>, id: string) => findings.find((f) => f.id === id)!;

test("a clean map passes every audit", () => {
  const findings = auditMaps(maps(), ["P-001"]);
  assert.ok(findings.every((f) => f.pass), JSON.stringify(findings.filter((f) => !f.pass), null, 2));
});

test("W2 fails when BASE does not change between consecutive story days", () => {
  // §14A: "At least two layers change class, and one of them is BASE."
  const m = maps({
    storyDays: [
      { day: "D-01", act: "A1", channel: "D2", subject: "C-01", outfit: outfit("polo shirt"), colourFamily: "earth" },
      { day: "D-02", act: "A2", channel: "D2", subject: "C-01", outfit: outfit("polo shirt", "cords", "work boots"), colourFamily: "navy/denim" },
    ],
  });
  const w2 = find(auditMaps(m, ["P-001"]), "W2");
  assert.equal(w2.pass, false);
  assert.match(w2.detail, /BASE unchanged/);
  // The model claimed a pass; our recount disagrees, and that is the point.
  assert.equal(w2.disagreesWithModel, true);
});

test("W1 fails on a BASE class repeating inside one act", () => {
  const m = maps({
    storyDays: [
      { day: "D-01", act: "A1", channel: "D2", subject: "C-01", outfit: outfit("polo shirt"), colourFamily: "earth" },
      { day: "D-02", act: "A1", channel: "D1", subject: "S-01", outfit: outfit("polo shirt", "cords", "boots"), colourFamily: "navy/denim" },
    ],
  });
  const w1 = find(auditMaps(m, ["P-001"]), "W1");
  assert.equal(w1.pass, false);
  assert.match(w1.detail, /polo shirt/);
});

test("W1 counts the narrator and anonymous cast together", () => {
  // §14A: "a build where the narrator and four anonymous subjects all appear
  // in a button-down shirt has repeated a BASE class four times, and
  // per-character counting would have reported five clean sheets."
  const m = maps({
    storyDays: [
      { day: "D-01", act: "A1", channel: "D2", subject: "C-01", outfit: outfit("button-down shirt"), colourFamily: "earth" },
      { day: "D-02", act: "A1", channel: "D5", subject: "S-01", outfit: outfit("button-down shirt"), colourFamily: "navy/denim" },
    ],
  });
  assert.equal(find(auditMaps(m, ["P-001"]), "W1").pass, false);
});

test("W3 fails when consecutive days share a colour family", () => {
  const m = maps({
    storyDays: [
      { day: "D-01", act: "A1", channel: "D2", subject: "C-01", outfit: outfit("tunic"), colourFamily: "earth" },
      { day: "D-02", act: "A2", channel: "D2", subject: "C-01", outfit: outfit("roll-neck", "cords", "boots"), colourFamily: "earth" },
    ],
  });
  assert.equal(find(auditMaps(m, ["P-001"]), "W3").pass, false);
});

test("W4 fails when an act-map row is missing story_day or capture_event_id", () => {
  // E4, added V7.48.8: both are mandatory on every row.
  const m = maps();
  m.actMap[0] = { ...m.actMap[0], storyDay: "" };
  const w4 = find(auditMaps(m, ["P-001"]), "W4");
  assert.equal(w4.pass, false);
  assert.match(w4.detail, /missing story_day or capture_event_id/);
});

test("W4 fails when a capture event resolves to no story day", () => {
  const m = maps({
    captureEvents: [
      { eventId: "E-09", storyDay: "D-99", locationId: "LOC-01", visibility: "CONCEALED", alibi: "x", beats: [] },
    ],
  });
  assert.match(find(auditMaps(m, ["P-001"]), "W4").detail, /events with no story day: E-09/);
});

test("coverage fails on an undispositioned phrase — uncovered must read zero", () => {
  const findings = auditMaps(maps(), ["P-001", "P-002"]);
  const coverage = find(findings, "COVERAGE");
  assert.equal(coverage.pass, false);
  assert.match(coverage.detail, /UNCOVERED \(1\): P-002/);
  assert.equal(coverage.disagreesWithModel, true, "the model reported uncovered: 0");
});

test("a gap in the beat numbering is itself the alarm", () => {
  const m = maps();
  m.actMap = [
    { ...m.actMap[0], beatId: "BR-01" },
    { ...m.actMap[0], beatId: "BR-04", ordinal: 2 },
  ];
  const beats = find(auditMaps(m, ["P-001"]), "BEAT-IDS");
  assert.equal(beats.pass, false);
  assert.match(beats.detail, /1→4/);
});

/* --- arsenal ---------------------------------------------------------- */

test("every gpt_image_2_5 call carries variant sunburst explicitly", () => {
  // "an omitted variant silently runs the retired one"
  const call = buildImageCall({ model: "gpt_image_2_5", prompt: "x" });
  assert.equal(call.variant, "sunburst");
  assert.equal(call.quality, "high");
  assert.equal(call.resolution, "2k");
});

test("quality and resolution are never omitted on any model", () => {
  // Catalogue defaults are low and 1k.
  const call = buildImageCall({ model: "nano_banana_2", prompt: "x" });
  assert.equal(call.quality, "high");
  assert.equal(call.resolution, "2k");
  assert.equal(call.variant, undefined, "variant is a GPT Image field only");
});

test("use_unlim is always explicit — omitting it makes the server submit nothing", () => {
  const call = buildImageCall({ model: "nano_banana_pro", prompt: "x" });
  assert.equal(typeof call.use_unlim, "boolean");
});

test("reference role is mapped per model", () => {
  // §4: gpt_image_2_5 takes references under image_references; Nano Banana under image.
  const gpt = buildImageCall({ model: "gpt_image_2_5", prompt: "x", medias: [{ role: "reference", value: "abc" }] });
  assert.equal(gpt.medias![0].role, "image_references");
  const nano = buildImageCall({ model: "nano_banana_pro", prompt: "x", medias: [{ role: "reference", value: "abc" }] });
  assert.equal(nano.medias![0].role, "image");
});

test("a model outside the arsenal is refused", () => {
  assert.throws(
    () => buildImageCall({ model: "nano_banana_flash" as never, prompt: "x" }),
    /not in the arsenal/,
  );
});

test("a job logging a retired model is a failed generation", () => {
  // §44.47: discarded, never accepted because the frame happened to look good.
  assert.throws(() => verifyLoggedModel("gpt_image_2_5", "gpt_image_2_5_flare"), RetiredModelError);
  assert.throws(() => verifyLoggedModel("nano_banana_pro", "nano_banana_flash"), RetiredModelError);
});

test("a logged model that is not the one passed is an alias mismatch", () => {
  // §5's measured finding: twelve consecutive jobs ran on a different model.
  assert.throws(() => verifyLoggedModel("nano_banana_pro", "nano_banana_2"), AliasMismatchError);
  assert.doesNotThrow(() => verifyLoggedModel("nano_banana_pro", "nano_banana_pro"));
});
