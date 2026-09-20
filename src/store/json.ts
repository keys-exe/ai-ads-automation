/**
 * Atomic JSON on disk, and the collection helper the §18 steps read through.
 *
 * Two properties matter here and neither is decoration:
 *
 *   1. **Writes are atomic.** A build is minutes of instrument work and
 *      generation spend. A half-written `run_ledger.json` from a crash in the
 *      middle of step 4 would lose all of it, so every write lands in a
 *      temporary file in the same directory and is renamed over the target.
 *      Rename within a filesystem is atomic; write-in-place is not.
 *   2. **Reads of a missing file return the empty value, not an error.** A
 *      build that has run step 2 and not step 3 has no characters file, and
 *      "no characters yet" is a normal state the chain asks about, not a
 *      failure.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export async function readJson<T>(path: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    // Naming the file is the whole value of catching this: a parse error with
    // no path sends you looking through the whole tree.
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  // The temp file shares the directory so the rename stays within one
  // filesystem — across a mount boundary rename fails with EXDEV.
  const temp = join(dir, `.${randomUUID()}.tmp`);
  await writeFile(temp, contents, "utf8");
  await rename(temp, path);
}

/**
 * A keyed collection stored as one JSON array.
 *
 * The §18 steps were written against SQL and the shapes they persist are rows
 * with a natural key — `beat_id`, `character_id`, `location_id`, `phrase_id`.
 * This gives them the four operations they actually used (replace the set,
 * upsert one, patch one, read all) without a database.
 *
 * `replaceAll` rather than append is deliberate and matches the SQL it
 * replaces: re-running step 3 replaces this build's cast, and §27B requires
 * contiguous `P-` numbering that a second append would break.
 */
export class Collection<T extends Record<string, unknown>> {
  constructor(
    private readonly path: string,
    private readonly key: keyof T & string,
  ) {}

  async all(): Promise<T[]> {
    return (await readJson<T[]>(this.path)) ?? [];
  }

  async find(id: string): Promise<T | undefined> {
    return (await this.all()).find((row) => String(row[this.key]) === id);
  }

  async replaceAll(rows: T[]): Promise<void> {
    await writeJson(this.path, rows);
  }

  /** Insert, or leave the existing row alone — the `ON CONFLICT DO NOTHING` case. */
  async insertIfAbsent(rows: T[]): Promise<void> {
    const existing = await this.all();
    const seen = new Set(existing.map((row) => String(row[this.key])));
    const additions = rows.filter((row) => !seen.has(String(row[this.key])));
    if (!additions.length) return;
    await writeJson(this.path, [...existing, ...additions]);
  }

  /**
   * Merge fields into the row with this key. A patch against a key that is not
   * there is a no-op, exactly as the UPDATE it replaces was: the chain patches
   * rows it has just written, and a missing one means an earlier step did not
   * run, which its own guard reports.
   */
  async patch(id: string, fields: Partial<T>): Promise<void> {
    const rows = await this.all();
    let touched = false;
    const next = rows.map((row) => {
      if (String(row[this.key]) !== id) return row;
      touched = true;
      return { ...row, ...fields };
    });
    if (touched) await writeJson(this.path, next);
  }

  async patchWhere(predicate: (row: T) => boolean, fields: Partial<T>): Promise<void> {
    const rows = await this.all();
    let touched = false;
    const next = rows.map((row) => {
      if (!predicate(row)) return row;
      touched = true;
      return { ...row, ...fields };
    });
    if (touched) await writeJson(this.path, next);
  }
}
