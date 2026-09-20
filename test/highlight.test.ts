import { test } from "node:test";
import assert from "node:assert/strict";
import { highlight, highlightProse, highlightJson, promptCharCount } from "../src/delivery/highlight";

/*
 * §16A states the highlight rules precisely enough to test, and says outright
 * that "the rule is the spec. A block delivered with its headers coloured by
 * hand is not compliant even where it happens to look right." These assert the
 * examples the standard itself gives.
 */

test("caps run of two or more words goes amber", () => {
  const out = highlightProse("THE ONE THING THAT HAPPENS in this beat");
  assert.match(out, /<span class="hl-caps">THE ONE THING THAT HAPPENS<\/span>/);
});

test("a single all-caps word is left alone", () => {
  // §16A: "`CAPTURE` on its own stays neutral".
  const out = highlightProse("CAPTURE must look like a phone camera file");
  assert.doesNotMatch(out, /hl-caps/);
});

test("sentence-initial capitals never trigger the caps pass", () => {
  // "because the second character of `The` is lowercase"
  const out = highlightProse("The camera is a lock. The beat holds.");
  assert.doesNotMatch(out, /hl-caps/);
});

test("prose splits at NEGATIVES: and the tail takes red", () => {
  const out = highlightProse("A REAL BEAT here.\nNEGATIVES: no vignette, no SLOW MOTION");
  assert.match(out, /<span class="hl-caps">A REAL BEAT<\/span>/);
  assert.match(out, /<span class="hl-negatives">NEGATIVES: no vignette, no SLOW MOTION<\/span>/);
});

test("the negatives tail is excluded from the caps pass", () => {
  // "so a negatives line never renders amber"
  const out = highlightProse("NEGATIVES: no SLOW MOTION, no SPEED RAMP");
  assert.doesNotMatch(out, /hl-caps/);
  assert.match(out, /hl-negatives/);
});

test("json keys take purple and values teal", () => {
  const out = highlightJson('{"subject": "a woman walking"}');
  assert.match(out, /<span class="hl-key">&quot;subject&quot;<\/span>/);
  assert.match(out, /<span class="hl-value">&quot;a woman walking&quot;<\/span>/);
});

test("the negatives value takes red in place of teal", () => {
  const out = highlightJson('{"negatives": "no vignette, no bokeh"}');
  assert.match(out, /<span class="hl-key">&quot;negatives&quot;<\/span>/);
  assert.match(out, /<span class="hl-negatives">&quot;no vignette, no bokeh&quot;<\/span>/);
  assert.doesNotMatch(out, /hl-value/);
});

test("braces and punctuation take grey", () => {
  const out = highlightJson('{"a": "b"}');
  assert.match(out, /<span class="hl-punct">\{<\/span>/);
});

test("exact words inside a value take blue", () => {
  const out = highlightJson(`{"delivery": "lands on 'never' and holds"}`);
  assert.match(out, /hl-exact/);
});

test("escaping happens before colouring, never after", () => {
  // "Colouring first and escaping after destroys the markup."
  const out = highlightProse('<script>alert("x")</script>');
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script&gt;/);
});

test("a json string containing a colon is not mistaken for a key", () => {
  const out = highlightJson('{"note": "time: 4pm"}');
  assert.match(out, /<span class="hl-value">&quot;time: 4pm&quot;<\/span>/);
});

test("character count is the minified length, because newlines count", () => {
  // §4, measured: the same clip prompt measured 2,474 minified and was
  // rejected at 2,506 pretty-printed.
  assert.equal(promptCharCount("ab\ncd"), 4);
  assert.equal(promptCharCount("no newlines"), 11);
});

test("highlight() resets state between passes", () => {
  highlight('{"negatives": "x"}', "json");
  const second = highlight('{"subject": "y"}', "json");
  assert.match(second, /<span class="hl-value">&quot;y&quot;<\/span>/);
});
