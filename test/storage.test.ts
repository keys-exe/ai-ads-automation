import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "storage-test-"));
process.env.STORAGE_ROOT = root;

const { storage, storeUpload, readAsset, writeAsset, materialiseAsset, safeFilename, __setDriver } =
  await import("../src/lib/storage");

afterEach(() => __setDriver(null));

test("defaults to the filesystem driver when no bucket is configured", () => {
  delete process.env.S3_BUCKET;
  __setDriver(null);
  assert.equal(storage().kind, "filesystem");
});

test("an upload round-trips through the driver", async () => {
  const stored = await storeUpload(1, "script", "my script.txt", Buffer.from("spoken lines"));
  assert.equal(stored.byteSize, 12);
  assert.equal((await readAsset(stored.storagePath)).toString("utf8"), "spoken lines");
});

test("the stored key is namespaced by build and kind", async () => {
  const stored = await storeUpload(42, "product", "front.png", Buffer.from("x"));
  assert.match(stored.storagePath, /^build-42\/product\//);
});

test("two uploads of the same filename do not collide", async () => {
  const a = await storeUpload(1, "product", "same.png", Buffer.from("first"));
  const b = await storeUpload(1, "product", "same.png", Buffer.from("second"));
  assert.notEqual(a.storagePath, b.storagePath);
  assert.equal((await readAsset(a.storagePath)).toString(), "first");
  assert.equal((await readAsset(b.storagePath)).toString(), "second");
});

test("materialise gives a real path the instruments can open", async () => {
  // ffmpeg and tesseract take a path, not bytes — this is the whole reason
  // the driver exposes materialise alongside get.
  const stored = await storeUpload(1, "inspo_video", "clip.mp4", Buffer.from("bytes"));
  const local = await materialiseAsset(stored.storagePath);
  try {
    assert.equal((await readFile(local.path)).toString(), "bytes");
  } finally {
    await local.cleanup();
  }
});

test("filesystem materialise is a no-op cleanup that does not delete the asset", async () => {
  const stored = await storeUpload(1, "script", "keep.txt", Buffer.from("still here"));
  const local = await materialiseAsset(stored.storagePath);
  await local.cleanup();
  assert.equal((await readAsset(stored.storagePath)).toString(), "still here");
});

test("a derived asset can be written and read back", async () => {
  await writeAsset("build-1/voice/take-1.mp3", Buffer.from("audio"), "audio/mpeg");
  assert.equal((await readAsset("build-1/voice/take-1.mp3")).toString(), "audio");
});

test("a key escaping the storage root is refused", async () => {
  // Keys are attacker-influenced through uploaded filenames.
  await assert.rejects(() => readAsset("../../etc/passwd"), /outside the storage root/);
  await assert.rejects(() => writeAsset("../escape.txt", Buffer.from("x")), /outside the storage root/);
});

test("filenames are stripped of path components and unsafe characters", () => {
  assert.equal(safeFilename("../../etc/passwd"), "passwd");
  assert.equal(safeFilename("my file (1).png"), "my_file__1_.png");
  assert.equal(safeFilename("...."), "upload");
  assert.equal(safeFilename(""), "upload");
});

test("a traversing filename cannot escape once stored", async () => {
  const stored = await storeUpload(1, "script", "../../../evil.txt", Buffer.from("x"));
  assert.match(stored.storagePath, /^build-1\/script\//);
  assert.doesNotMatch(stored.storagePath, /\.\./);
});

process.on("exit", () => { void rm(root, { recursive: true, force: true }); });
