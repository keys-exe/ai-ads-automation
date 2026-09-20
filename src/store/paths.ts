/**
 * The build directory — Appendix E9, verbatim.
 *
 *   "/build/{product_sheet.md, product_sheet.py, absorption_sheet.md,
 *    build_sheet.md, act_map.json, phrase_inventory.json, wardrobe_map.json,
 *    location_sheets/, registries/{roster,voice,scene,subject}.json,
 *    run_ledger.json, beats/{BEAT-ID}.t2i.txt, beats/{BEAT-ID}.i2v.json,
 *    capcut_block.md}"
 *
 * E9 states the reason for the layout and it is the reason this store exists
 * at all: "one beat, one pair of files, so §34 global corrections, coverage
 * diffs and reissue passes run as scripts over the tree, never as memory."
 *
 * A build is addressed by slug rather than by a serial id, because the slug is
 * what a person types at a prompt and what git shows in a diff.
 */

import { join, resolve } from "node:path";

/** Where builds live. One directory per build, all of it git-trackable. */
export const BUILDS_ROOT = resolve(
  process.env.BUILDS_ROOT ?? join(process.cwd(), "builds"),
);

/**
 * Slugs become directory names, so they are constrained to what is safe in a
 * path on every platform and unambiguous in a shell.
 */
export function assertSlug(slug: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) {
    throw new Error(
      `"${slug}" is not a usable build name. Use lowercase letters, digits, "-" and "_", starting with a letter or digit, up to 64 characters.`,
    );
  }
  return slug;
}

export function buildDir(slug: string): string {
  return join(BUILDS_ROOT, assertSlug(slug));
}

/**
 * Every path the pipeline writes. Collected here so the E9 layout is stated
 * once and a rename cannot leave half the tree behind.
 */
export function paths(slug: string) {
  const dir = buildDir(slug);
  return {
    dir,

    /** Where the operator drops the bundle. Not an E9 path — the intake surface. */
    inbox: join(dir, "inbox"),
    /** The resolved bundle: what the inbox actually held, after classification. */
    bundle: join(dir, "bundle.json"),
    /** The build record — name, standards version, declared locks, timestamps. */
    build: join(dir, "build.json"),

    /** E3. The build's state file. Computed, never hand-maintained. */
    ledger: join(dir, "run_ledger.json"),

    productSheetMd: join(dir, "product_sheet.md"),
    productSheetPy: join(dir, "product_sheet.py"),
    absorptionSheet: join(dir, "absorption_sheet.md"),
    buildSheet: join(dir, "build_sheet.md"),
    capcutBlock: join(dir, "capcut_block.md"),

    actMap: join(dir, "act_map.json"),
    phraseInventory: join(dir, "phrase_inventory.json"),
    wardrobeMap: join(dir, "wardrobe_map.json"),

    locationSheets: join(dir, "location_sheets"),
    locationSheet: (locationId: string) =>
      join(dir, "location_sheets", `${safeName(locationId)}.json`),

    registries: join(dir, "registries"),
    registry: (name: RegistryName) => join(dir, "registries", `${name}.json`),

    beats: join(dir, "beats"),
    beatT2I: (beatId: string) => join(dir, "beats", `${safeName(beatId)}.t2i.txt`),
    beatI2V: (beatId: string) => join(dir, "beats", `${safeName(beatId)}.i2v.json`),

    /** Not E9: the internal collections the §18 steps read back. */
    collections: join(dir, "collections"),
    collection: (name: string) => join(dir, "collections", `${safeName(name)}.json`),

    /** Not E9: measurements, generated media and the rendered deliverables. */
    measurements: join(dir, "measurements.json"),
    media: join(dir, "media"),
    deliveries: join(dir, "deliveries"),
    /** Step artefacts keyed by kind, as the processes emit them. */
    artifacts: join(dir, "artifacts"),
    artifact: (kind: string) => join(dir, "artifacts", `${safeName(kind)}.json`),
  };
}

/** E3's four named registries. */
export type RegistryName = "roster" | "voice" | "scene" | "subject";

/**
 * Beat and location ids come from the model and reach the filesystem, so they
 * are constrained before they become a filename. "PF-BR-01" survives; a path
 * separator or a traversal segment does not.
 */
export function safeName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
  if (!cleaned) throw new Error(`"${value}" has no usable characters for a filename.`);
  return cleaned;
}
