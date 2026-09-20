import { test } from "node:test";
import assert from "node:assert/strict";
import { friendly } from "../src/lib/friendly-errors";

test("a missing Anthropic connection names Anthropic and where to fix it", () => {
  const f = friendly(new Error("No Anthropic connection is configured. Add one in Settings."));
  assert.match(f.summary, /Anthropic is not connected/);
  assert.match(f.fix!, /console\.anthropic\.com/);
  assert.equal(f.href, "/settings");
});

test("a 401 becomes a key problem, not a status code", () => {
  const f = friendly(new Error("elevenlabs: HTTP 401"));
  assert.match(f.summary, /rejected the API key/);
  assert.match(f.fix!, /fresh one/);
});

test("running out of credit is distinguished from a bad key", () => {
  const f = friendly(new Error("400: your credit balance is too low"));
  assert.match(f.summary, /run out of credit/);
  assert.doesNotMatch(f.summary, /key/);
});

test("a rate limit says to wait rather than to change anything", () => {
  const f = friendly(new Error("heygen: HTTP 429 Too Many Requests"));
  assert.match(f.fix!, /Wait a few minutes/);
  assert.match(f.fix!, /Nothing is broken/);
});

test("a missing instrument points at the worker image", () => {
  const f = friendly(new Error('Required instrument "ffmpeg" is not on PATH.'));
  assert.match(f.summary, /video tool is missing/);
  assert.match(f.fix!, /worker/);
});

test("a silent clip explains why it cannot clone a voice", () => {
  const f = friendly(new Error("/tmp/clip.mp4 has no audio stream."));
  assert.match(f.summary, /no sound/);
});

test("an unrecognised error says so instead of inventing a cause", () => {
  const f = friendly(new Error("TypeError: undefined is not a function"));
  assert.match(f.summary, /do not have a specific explanation/);
  assert.equal(f.fix, null);
});

test("the technical message is always preserved", () => {
  const f = friendly(new Error("HTTP 401"));
  assert.match(f.technical, /HTTP 401/);
});

test("a non-Error value does not crash the mapper", () => {
  assert.match(friendly("plain string failure").technical, /plain string failure/);
  assert.doesNotThrow(() => friendly(null));
});
