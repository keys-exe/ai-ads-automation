import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * The intake is the one place a wrong guess is invisible until beat forty:
 * §18 step 2's verification checks the product against what the bundle claims,
 * so a script filed as a Product Sheet produces a confident, wrong build.
 * These cover the rules that decide, and the cases that must refuse to.
 */

const root = await mkdtemp(join(tmpdir(), "ai-ads-classify-"));
process.env.BUILDS_ROOT = root;

const { classifyInbox } = await import("../src/intake/classify");

async function inbox(slug: string, files: Record<string, string>): Promise<void> {
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, slug, "inbox", name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, contents);
  }
}

function kinds(assets: Array<{ kind: string; filename: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const asset of assets) (out[asset.kind] ??= []).push(asset.filename);
  return out;
}

test("extension decides the class and the name decides the role", async () => {
  await inbox("full", {
    "reference-ad.mp4": "x",
    "the-script.md": "hook",
    "product-sheet.md": "spec",
    "hero.jpg": "x",
    "angle-2.png": "x",
  });

  const bundle = await classifyInbox("full");
  const byKind = kinds(bundle.assets);

  assert.deepEqual(byKind.inspo_video, ["reference-ad.mp4"]);
  assert.deepEqual(byKind.script, ["the-script.md"]);
  assert.deepEqual(byKind.product_sheet, ["product-sheet.md"]);
  assert.deepEqual(byKind.product?.sort(), ["angle-2.png", "hero.jpg"]);
  assert.equal(bundle.unclassified.length, 0);
});

test("a placement/ directory marks its images as the §9D worn reference", async () => {
  await inbox("placed", {
    "script.txt": "line",
    "front.jpg": "x",
    "placement/on-wrist.jpg": "x",
  });

  const byKind = kinds((await classifyInbox("placed")).assets);
  assert.deepEqual(byKind.product, ["front.jpg"]);
  assert.deepEqual(byKind.product_placement, [join("placement", "on-wrist.jpg")]);
});

test("one unnamed text file is the script — a build cannot start without one", async () => {
  // §18 step 2 creates a Product Sheet where absent, so the ambiguous single
  // file resolves the way that leaves the build runnable.
  await inbox("lonely", { "untitled.md": "hook" });
  const byKind = kinds((await classifyInbox("lonely")).assets);
  assert.deepEqual(byKind.script, ["untitled.md"]);
});

test("two unnamed text files are reported, never guessed between", async () => {
  await inbox("ambiguous", { "one.md": "a", "two.md": "b" });
  const bundle = await classifyInbox("ambiguous");

  assert.equal(bundle.assets.length, 0);
  assert.equal(bundle.unclassified.length, 2);
  assert.match(bundle.unclassified[0].reason, /script or the Product Sheet/);
});

test("a second inspo video collides rather than being picked between", async () => {
  // §42 absorbs one reference. Two is not a bundle this can run.
  await inbox("two-videos", { "a.mp4": "x", "b.mp4": "x", "script.md": "s" });
  const bundle = await classifyInbox("two-videos");

  assert.equal(bundle.assets.filter((a) => a.kind === "inspo_video").length, 1);
  assert.equal(bundle.unclassified.length, 1);
  assert.match(bundle.unclassified[0].reason, /takes one inspo video/);
});

test("the .py companion is picked up and is not an asset in its own right", async () => {
  // Appendix B: "every Product Sheet ships as a pair" — the .py carries the
  // machine half, and E5 consumes its slots.
  await inbox("paired", {
    "script.md": "s",
    "product-sheet.md": "spec",
    "product-sheet.py": "SITE = 'x'",
  });

  const bundle = await classifyInbox("paired");
  assert.ok(bundle.productSheetPy?.endsWith("product-sheet.py"));
  assert.equal(bundle.assets.some((a) => a.filename.endsWith(".py")), false);
});

test("bundle.json wins outright, so an unreadable bundle still has an escape hatch", async () => {
  await inbox("manifest", {
    "draft-3.md": "the script, named nothing like one",
    "bundle.json": JSON.stringify({ assets: [{ kind: "script", file: "draft-3.md" }] }),
  });

  const byKind = kinds((await classifyInbox("manifest")).assets);
  assert.deepEqual(byKind.script, ["draft-3.md"]);
});

test("a file nothing reads is reported with the reason, not dropped", async () => {
  await inbox("odd", { "script.md": "s", "notes.pages": "x" });
  const bundle = await classifyInbox("odd");
  assert.equal(bundle.unclassified.length, 1);
  assert.match(bundle.unclassified[0].reason, /\.pages/);
});
