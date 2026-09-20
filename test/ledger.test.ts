import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * The ledger is the build's memory. E3: it is the source for "§34 global scans,
 * reissue passes, resume-after-interruption, and the Open Decisions counts —
 * computed, never hand-maintained." A build is minutes of instrument work and
 * real generation spend, so these cover the two ways that memory could be lost:
 * an interleaved write, and a half-written file.
 */

const root = await mkdtemp(join(tmpdir(), "ai-ads-ledger-"));
process.env.BUILDS_ROOT = root;

const { updateLedger, readLedger, blankBeatRow, budgetExhausted, rerollsSpent, REROLL_BUDGET } =
  await import("../src/store/ledger");
const { Collection, writeJson, readJson } = await import("../src/store/json");
const { paths } = await import("../src/store/paths");

test("concurrent updates are serialised, so no write is lost", async () => {
  // Two steps of one build can be in flight at once. Read-modify-write without
  // a queue silently drops one of them, and the loss is invisible.
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      updateLedger("race", (ledger) => {
        ledger.beats[`B-${i}`] = blankBeatRow(`B-${i}`);
      }),
    ),
  );

  const ledger = await readLedger("race");
  assert.equal(Object.keys(ledger!.beats).length, 25);
});

test("a write leaves no temporary file behind", async () => {
  await updateLedger("clean", (ledger) => { ledger.declared.mode = "Mode 1 Realistic"; });
  const entries = await readdir(paths("clean").dir);
  assert.equal(entries.some((name) => name.endsWith(".tmp")), false);
});

test("the ledger on disk is valid JSON after every write", async () => {
  await updateLedger("valid", (ledger) => { ledger.plates["L-01"] = "job-1"; });
  const raw = await readFile(paths("valid").ledger, "utf8");
  assert.doesNotThrow(() => JSON.parse(raw));
});

test("E3's explicit null is preserved, not dropped", async () => {
  // "every location row carrying a `dwelling_id` or an explicit null" — the
  // difference between "no plate" and "not asked" is the whole point.
  await updateLedger("nulls", (ledger) => {
    ledger.plates["L-01"] = null;
    ledger.subjects["S-01"] = null;
  });

  const ledger = await readLedger("nulls");
  assert.ok("L-01" in ledger!.plates);
  assert.equal(ledger!.plates["L-01"], null);
  assert.ok("S-01" in ledger!.subjects);
});

test("E2's budget is two rerolls per beat PER failure class", async () => {
  const row = blankBeatRow("PF-BR-01");
  const at = new Date().toISOString();

  row.retries.push({ class: "QUALITY_FAIL", action: "targeted reroll", ts: at });
  row.retries.push({ class: "QUALITY_FAIL", action: "escalation string", ts: at });

  assert.equal(rerollsSpent(row, "QUALITY_FAIL"), REROLL_BUDGET);
  assert.equal(budgetExhausted(row, "QUALITY_FAIL"), true);
  // A fresh class still has its own budget — that is what "per failure class" means.
  assert.equal(budgetExhausted(row, "CONSISTENCY_FAIL"), false);
});

test("a missing collection reads as empty, because 'not yet' is a normal state", async () => {
  const rows = await new Collection<{ id: string }>(paths("absent").collection("nope"), "id").all();
  assert.deepEqual(rows, []);
});

test("replaceAll replaces rather than appends, so re-running a step cannot duplicate", async () => {
  // §27B requires contiguous P- numbering; an append on a second run breaks it.
  const phrases = new Collection<{ phraseId: string; text: string }>(
    paths("replace").phraseInventory,
    "phraseId",
  );

  await phrases.replaceAll([{ phraseId: "P-001", text: "first" }]);
  await phrases.replaceAll([{ phraseId: "P-001", text: "second" }, { phraseId: "P-002", text: "new" }]);

  const rows = await phrases.all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, "second");
});

test("patch merges fields and leaves the rest of the row alone", async () => {
  const chars = new Collection<{ characterId: string; name: string; sheetStatus: string }>(
    paths("patch").registry("roster"),
    "characterId",
  );

  await chars.replaceAll([{ characterId: "C-01", name: "Narrator", sheetStatus: "pending" }]);
  await chars.patch("C-01", { sheetStatus: "locked" });

  const row = await chars.find("C-01");
  assert.equal(row?.sheetStatus, "locked");
  assert.equal(row?.name, "Narrator", "patch must not drop untouched fields");
});

test("a patch against an absent key is a no-op, not a crash", async () => {
  const items = new Collection<{ id: string; v: number }>(paths("noop").collection("x"), "id");
  await items.replaceAll([{ id: "a", v: 1 }]);
  await items.patch("missing", { v: 99 });
  assert.deepEqual(await items.all(), [{ id: "a", v: 1 }]);
});

test("a corrupt file names itself rather than failing anonymously", async () => {
  const path = paths("corrupt").collection("broken");
  await writeJson(path, { ok: true });
  const { writeText } = await import("../src/store/json");
  await writeText(path, "{ not json");

  await assert.rejects(() => readJson(path), /broken\.json is not valid JSON/);
});
