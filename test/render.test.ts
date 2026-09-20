import { test } from "node:test";
import assert from "node:assert/strict";
import { carousel, CAROUSEL_SCRIPT, page, copyBlock, type BeatView } from "../src/delivery/widgets";
import { THEME_CSS, HIGHLIGHT_COLOURS } from "../src/delivery/theme";

/*
 * §16A's reference plate is locked: "It is not a suggestion of how the spec
 * might be built; it **is** the spec at implementation depth, and a batch that
 * deviates from it is a §34 correction, not a style preference."
 *
 * So these are conformance tests, not taste tests. Each one quotes the clause
 * it enforces.
 */

const BEAT: BeatView = {
  beatId: "PF-BR-01",
  name: "kitchen reach",
  scriptLine: "It just stopped hurting.",
  slots: "MECHANISM · narrator · propped candid · stab · kitchen",
  faceState: "NOFACE",
  extraBadges: [],
  seed: {
    raw: "CAPTURE\nShot on an iPhone 17 Pro Max.\nNEGATIVES: no grading",
    params: "gpt_image_2_5 · sunburst · high · 2k · 9:16",
    register: "prose",
  },
  clip: null,
};

test("counts are computed in the page, never written into it", () => {
  // "Counts are computed at render, never typed ... A typed count drifts from
  // its string the first time the string is edited; a computed one cannot."
  const html = carousel("c", "batch", [BEAT]);
  const minified = BEAT.seed!.raw.replace(/\n/g, "").length;

  assert.equal(
    html.includes(`${minified} chars`),
    false,
    "the rendered markup must not carry a pre-computed count",
  );
  assert.match(CAROUSEL_SCRIPT, /raw\.replace\(\/\\n\/g, ""\)\.length/);
  assert.match(CAROUSEL_SCRIPT, /toLocaleString\(\)/);
});

test("copy lifts raw text from a stored attribute, never the highlighted DOM", () => {
  // "Syntax colour must never reach the clipboard. A prompt that pastes with
  // markup in it is undelivered."
  assert.match(CAROUSEL_SCRIPT, /getAttribute\("data-raw"\)/);
  assert.equal(/innerHTML.*clipboard/.test(CAROUSEL_SCRIPT), false);

  const block = copyBlock("NEGATIVES: no grading");
  assert.match(block, /data-raw="/);
});

test("a copy block's data-raw is escaped, so a quote cannot break out of it", () => {
  const block = copyBlock('he said "no" & left');
  assert.match(block, /data-raw="[^"]*&quot;no&quot;[^"]*"/);
});

test("the copy button flips for 1.4s, as the plate states", () => {
  assert.match(CAROUSEL_SCRIPT, /1400/);
});

test("chevrons are disabled at the ends, never hidden and never wrapping", () => {
  // "At the ends of a batch they take the `disabled` attribute — never hidden,
  // never wrapping round to the far end."
  assert.match(CAROUSEL_SCRIPT, /prev\.disabled = index === 0/);
  assert.match(CAROUSEL_SCRIPT, /next\.disabled = index === beats\.length - 1/);
  assert.match(THEME_CSS, /\.nav-btn\[disabled\]/);
  assert.equal(/\.nav-btn\[disabled\][^}]*display:\s*none/.test(THEME_CSS), false);
});

test("the active dot reads by colour AND width, not width alone", () => {
  // "Width alone does not read as a selection — colour and width together do."
  const active = THEME_CSS.match(/\.dot\.active \{[^}]*\}/)?.[0] ?? "";
  assert.match(active, /width:\s*22px/);
  assert.match(active, /background:\s*var\(--fill-accent\)/);
});

test("one accent per view — the dot is the only accent fill", () => {
  // The toggle is "filled neutral, never accent".
  const toggleActive = THEME_CSS.match(/\.toggle button\.active \{[^}]*\}/)?.[0] ?? "";
  assert.match(toggleActive, /background:\s*var\(--surface-1\)/);
  assert.equal(/--fill-accent/.test(toggleActive), false);
});

test("the script panel takes a single-sided border and no rounded corners", () => {
  const panel = THEME_CSS.match(/\.script-panel \{[^}]*\}/)?.[0] ?? "";
  assert.match(panel, /border-left:\s*3px solid var\(--border-accent\)/);
  assert.match(panel, /border-radius:\s*0/);
});

test("the script line is the largest element on the card", () => {
  const script = Number(THEME_CSS.match(/\.script-line \{[^}]*font-size:\s*(\d+)px/)?.[1]);
  const beatId = Number(THEME_CSS.match(/\.beat-id \{[^}]*font-size:\s*(\d+)px/)?.[1]);
  const body = Number(THEME_CSS.match(/pre\.prompt \{[^}]*font-size:\s*([\d.]+)px/)?.[1]);

  assert.equal(script, 24);
  assert.equal(body, 11.5);
  assert.ok(script > beatId, "the script line identifies the beat and outranks its id");
});

test("the six highlight colours are overridden under BOTH dark selectors", () => {
  // "light values as the default and dark values overridden under **both**
  // `:root[data-mode=\"dark\"]` and `@media (prefers-color-scheme: dark)`, so the
  // card flips with the host rather than with a guess about it."
  assert.match(THEME_CSS, /:root\[data-mode="dark"\]/);
  assert.match(THEME_CSS, /@media \(prefers-color-scheme: dark\)/);

  for (const pair of Object.values(HIGHLIGHT_COLOURS)) {
    const occurrences = THEME_CSS.split(pair.dark).length - 1;
    assert.equal(occurrences, 2, `${pair.dark} must appear under both dark selectors`);
  }
});

test("hex values are never written inline in the markup", () => {
  // "Hex values are in the colour table below and are never written inline."
  const html = page({ title: "t", subtitle: "s", body: carousel("c", "batch", [BEAT]) });
  const body = html.slice(html.indexOf("</style>"));
  assert.equal(/#[0-9A-Fa-f]{6}/.test(body), false);
});

test("the widget opens with a visually-hidden heading naming its beats", () => {
  const html = carousel("c", "Hook batch", [BEAT]);
  assert.match(html, /<h2 class="sr-only">Hook batch — 1 beat: PF-BR-01<\/h2>/);
});

test("the face state carries its gloss and is never the bare token", () => {
  const html = carousel("c", "batch", [BEAT]);
  assert.match(html, /NOFACE · nobody's in frame/);
  assert.equal(/"faceState":"NOFACE"/.test(html), false, "the bare token must never be what renders");
});

test("a prompt containing </script> cannot close the data block", () => {
  const nasty: BeatView = {
    ...BEAT,
    seed: { raw: "before </script><img src=x> after", params: "p", register: "prose" },
  };
  const html = carousel("c", "batch", [nasty]);

  const dataBlock = html.slice(html.indexOf('class="carousel-data"'));
  assert.equal(dataBlock.includes("</script><img"), false);
  assert.match(dataBlock, /\\u003c\/script>/);
});

test("the page is self-contained — nothing reaches the network", () => {
  // A deliverable opened from disk with no network must still render.
  const html = page({ title: "t", subtitle: "s", body: carousel("c", "b", [BEAT]), script: CAROUSEL_SCRIPT });
  assert.equal(/src="http/.test(html), false);
  assert.equal(/href="http/.test(html), false);
  assert.equal(/@import/.test(html), false);
});
