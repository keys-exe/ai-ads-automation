import { test } from "node:test";
import assert from "node:assert/strict";
import { splitScript, splitSentences, countWords } from "../src/processes/voice/split";

const SCRIPT = [
  "My knees used to lock up on the stairs.",
  "Every single morning, the same thing.",
  "I tried braces, creams, magnets, patches.",
  "None of it held for more than a week.",
  "Then my physio showed me what was actually happening underneath.",
  "It turns out the joint was taking load it was never meant to carry.",
  "This band moves that load off the joint and onto the muscle around it.",
  "Two weeks later I walked down to the shops without stopping.",
  "That was the first time in three years.",
  "If your knees do that on the stairs, this is worth ten minutes of your time.",
].join(" ");

test("splits into the requested number of parts", () => {
  const parts = splitScript(SCRIPT, { minParts: 3, maxParts: 4 });
  assert.ok(parts.length >= 3 && parts.length <= 4, `got ${parts.length} parts`);
});

test("never splits mid-sentence", () => {
  // §29: a segment is a whole thought. A cut inside one reads as a dropped frame.
  const parts = splitScript(SCRIPT);
  for (const part of parts) {
    assert.match(part.text.trim(), /[.!?…]["'”’)]*$/, `part ${part.ordinal} does not end on a sentence`);
  }
});

test("every sentence survives exactly once", () => {
  const original = splitSentences(SCRIPT);
  const recombined = splitScript(SCRIPT).flatMap((p) => splitSentences(p.text));
  assert.equal(recombined.length, original.length, "no sentence lost or duplicated");
  assert.deepEqual(recombined, original, "order preserved");
});

test("no segment is empty", () => {
  // An empty part renders as a shot with nothing in it.
  for (const part of splitScript(SCRIPT)) {
    assert.ok(part.text.trim().length > 0, `part ${part.ordinal} is empty`);
    assert.ok(part.wordCount > 0);
  }
});

test("parts come out reasonably balanced", () => {
  const parts = splitScript(SCRIPT);
  const lengths = parts.map((p) => p.charCount);
  const longest = Math.max(...lengths);
  const shortest = Math.min(...lengths);
  // Sentence boundaries constrain this, so the bar is "not wildly uneven"
  // rather than equal.
  assert.ok(longest / shortest < 3, `imbalanced: ${lengths.join(", ")}`);
});

test("the character ceiling forces more parts when it has to", () => {
  // Eleven v3 caps at 3,000 characters per request; that gate outranks the
  // requested part count.
  const long = Array.from({ length: 60 }, (_, i) => `This is sentence number ${i} and it carries a reasonable amount of text to push the total length up well past the ceiling.`).join(" ");
  const parts = splitScript(long, { minParts: 3, maxParts: 4, charLimit: 500 });
  assert.ok(parts.length > 4, `ceiling should force more than 4 parts, got ${parts.length}`);
  for (const part of parts) {
    assert.ok(part.charCount <= 500, `part ${part.ordinal} is ${part.charCount} chars, over the ceiling`);
    assert.match(part.splitReason, /ceiling/);
  }
});

test("a sentence longer than the ceiling is surfaced, not cut mid-clause", () => {
  const monster = "word ".repeat(200) + "end.";
  assert.throws(
    () => splitScript(monster, { charLimit: 100 }),
    /cannot be split on a sentence boundary/,
  );
});

test("fewer sentences than parts yields one sentence per part, not empty parts", () => {
  const two = "First thought here. Second thought here.";
  const parts = splitScript(two, { minParts: 3, maxParts: 4 });
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.text.trim().length > 0));
});

test("empty input yields no segments rather than one empty one", () => {
  assert.deepEqual(splitScript("   "), []);
});

test("sentence splitting handles quotes and ellipses", () => {
  const text = 'She said "it just gave out." Then nothing… for three years. Right?';
  const sentences = splitSentences(text);
  assert.equal(sentences.length, 3, sentences.join(" | "));
});

test("word count ignores extra whitespace", () => {
  assert.equal(countWords("  one   two \n three "), 3);
});
