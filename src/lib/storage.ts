import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Local-disk storage for the upload bundle.
 *
 * §E9 makes the build directory the working store — "one beat, one pair of
 * files, so §34 global corrections, coverage diffs and reissue passes run as
 * scripts over the tree". The layout here mirrors that, so swapping the driver
 * for S3 later is a path-resolution change and nothing else.
 */
export const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT ?? join(process.cwd(), "storage"));

export function buildDir(buildId: number | string): string {
  return join(STORAGE_ROOT, `build-${buildId}`);
}

export function resolveStoragePath(relativePath: string): string {
  const full = resolve(STORAGE_ROOT, relativePath);
  // A stored path is attacker-influenced via the uploaded filename; refuse
  // anything that escapes the storage root rather than trusting the caller.
  if (!full.startsWith(STORAGE_ROOT + "/") && full !== STORAGE_ROOT) {
    throw new Error(`Refusing to resolve a path outside the storage root: ${relativePath}`);
  }
  return full;
}

/** Strip directory components and anything that is not a safe filename character. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 180) || "upload";
}

export interface StoredFile {
  storagePath: string;
  absolutePath: string;
  byteSize: number;
}

export async function storeUpload(
  buildId: number | string,
  kind: string,
  filename: string,
  data: Buffer,
): Promise<StoredFile> {
  // A uuid prefix keeps two uploads of the same name in one bundle distinct
  // without the caller having to care.
  const relative = join(`build-${buildId}`, kind, `${randomUUID().slice(0, 8)}-${safeFilename(filename)}`);
  const absolute = resolveStoragePath(relative);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, data);
  return { storagePath: relative, absolutePath: absolute, byteSize: data.byteLength };
}
