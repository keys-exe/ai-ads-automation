/**
 * The intake: one folder in, one bundle out.
 *
 * §18 step 2 absorbs "the script, product, Product Sheet" and step 1 the inspo
 * video, and the operator has all four (sometimes six) files in hand at once.
 * Asking which is which, file by file, is a form — so this reads the folder and
 * decides, and asks only about what it genuinely cannot place.
 *
 * Two rules govern the guessing:
 *
 *   - **Extension decides the class, name decides the role.** A `.mp4` is the
 *     inspo video whatever it is called; a `.md` is a Product Sheet or a script
 *     depending on its name.
 *   - **Ambiguity is reported, never resolved.** A file that could be either
 *     comes back as `unclassified` with the reason. §18's step-2 verification
 *     depends on the bundle being what it claims, and a wrong guess here is
 *     invisible until beat forty.
 *
 * Nothing is copied. Assets carry absolute paths into the inbox, which is what
 * the instruments take anyway (§42 Part 1 runs ffmpeg over a path).
 */

import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import type { AssetKind, AssetRecord, Bundle } from "@/store/build";
import { paths } from "@/store/paths";

const VIDEO = new Map(Object.entries({
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v",
  ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
}));

const IMAGE = new Map(Object.entries({
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".heic": "image/heic", ".gif": "image/gif",
  ".avif": "image/avif",
}));

const TEXT = new Map(Object.entries({
  ".md": "text/markdown", ".markdown": "text/markdown",
  ".txt": "text/plain", ".text": "text/plain",
}));

/** A Product Sheet by name. Appendix B calls it the Product Sheet; people call it a spec. */
const SHEET_NAME = /(^|[^a-z])(product[-_. ]?sheet|productsheet|spec|sheet)([^a-z]|$)/i;
/** A script by name. §3's build types are the words people actually use. */
const SCRIPT_NAME = /(^|[^a-z])(script|vsl|ugc|copy|voice[-_. ]?over|vo)([^a-z]|$)/i;
/** §9D's worn-placement reference — the one that unblocks REVEAL beats. */
const PLACEMENT_NAME = /(^|[^a-z])(placement|worn|wearing|on[-_. ]?body|in[-_. ]?situ)([^a-z]|$)/i;

export interface ClassifyResult extends Bundle {
  /** The Product Sheet's `.py` companion (Appendix B), where the inbox holds one. */
  productSheetPy: string | null;
}

/**
 * Walk the inbox and classify everything in it.
 *
 * A `bundle.json` in the inbox is an explicit manifest and wins outright — it
 * is the escape hatch for a bundle this cannot read, and the record of what the
 * operator meant.
 */
export async function classifyInbox(slug: string): Promise<ClassifyResult> {
  const inbox = paths(slug).inbox;
  const files = await walk(inbox);

  const override = files.find((file) => file.name.toLowerCase() === "bundle.json");
  if (override) return readManifest(slug, override.path, files);

  const assets: AssetRecord[] = [];
  const unclassified: Bundle["unclassified"] = [];
  let productSheetPy: string | null = null;

  // Text files are decided together: with exactly one of them and no naming
  // signal, it is the script, because a build without a script cannot start
  // while a Product Sheet is created where absent (§18 step 2).
  const textFiles = files.filter((file) => TEXT.has(extname(file.name).toLowerCase()));

  for (const file of files) {
    const extension = extname(file.name).toLowerCase();
    const lower = file.name.toLowerCase();
    const inPlacementDir = file.relative.split(sep).slice(0, -1)
      .some((segment) => PLACEMENT_NAME.test(segment));

    if (lower === "bundle.json") continue;

    if (extension === ".py") {
      // Appendix B: "every Product Sheet ships as a pair". The `.py` carries
      // the machine half and is not an asset in its own right.
      if (SHEET_NAME.test(file.name) || !productSheetPy) productSheetPy = file.path;
      continue;
    }

    const video = VIDEO.get(extension);
    if (video) {
      assets.push(await record(file, "inspo_video", video));
      continue;
    }

    const image = IMAGE.get(extension);
    if (image) {
      const kind: AssetKind =
        inPlacementDir || PLACEMENT_NAME.test(file.name) ? "product_placement" : "product";
      assets.push(await record(file, kind, image));
      continue;
    }

    const text = TEXT.get(extension);
    if (text) {
      const kind = classifyText(file.name, textFiles.length);
      if (!kind) {
        unclassified.push({
          filename: file.relative,
          path: file.path,
          reason:
            "Two or more text files and nothing in this one's name says whether it is the script or the Product Sheet. Rename it, or list it in bundle.json.",
        });
        continue;
      }
      assets.push(await record(file, kind, text));
      continue;
    }

    unclassified.push({
      filename: file.relative,
      path: file.path,
      reason: `Nothing in the pipeline reads "${extension || "a file with no extension"}".`,
    });
  }

  return finish(slug, assets, unclassified, productSheetPy);
}

function classifyText(name: string, textFileCount: number): AssetKind | null {
  if (SHEET_NAME.test(name)) return "product_sheet";
  if (SCRIPT_NAME.test(name)) return "script";
  return textFileCount === 1 ? "script" : null;
}

/**
 * More than one inspo video, or more than one script, is not a bundle this can
 * run: §42 absorbs one reference and §18 builds one script. Rather than pick,
 * the extras come back unclassified with the collision named.
 */
function finish(
  slug: string,
  assets: AssetRecord[],
  unclassified: Bundle["unclassified"],
  productSheetPy: string | null,
): ClassifyResult {
  const kept: AssetRecord[] = [];
  const singular: AssetKind[] = ["inspo_video", "script", "product_sheet"];

  for (const kind of singular) {
    const matches = assets.filter((asset) => asset.kind === kind);
    kept.push(...matches.slice(0, 1));
    for (const extra of matches.slice(1)) {
      unclassified.push({
        filename: extra.filename,
        path: extra.path,
        reason: `A build takes one ${kind.replace("_", " ")}. "${kept.find((a) => a.kind === kind)?.filename}" was taken as the ${kind.replace("_", " ")}; name this one differently or list both in bundle.json.`,
      });
    }
  }

  kept.push(...assets.filter((asset) => !singular.includes(asset.kind)));

  return {
    slug,
    assets: kept,
    unclassified,
    productSheetPy,
    classifiedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */

interface FoundFile {
  name: string;
  relative: string;
  path: string;
}

async function walk(root: string): Promise<FoundFile[]> {
  const found: FoundFile[] = [];

  const visit = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      found.push({ name: entry.name, relative: relative(root, full), path: full });
    }
  };

  await visit(root);
  return found.sort((a, b) => a.relative.localeCompare(b.relative));
}

async function record(file: FoundFile, kind: AssetKind, mimeType: string): Promise<AssetRecord> {
  const info = await stat(file.path);
  return {
    kind,
    filename: file.relative,
    path: file.path,
    mimeType,
    byteSize: info.size,
  };
}

/**
 * An explicit `bundle.json` in the inbox. Paths in it are relative to the
 * inbox, so the file stays portable if the build directory moves.
 */
async function readManifest(
  slug: string,
  manifestPath: string,
  files: FoundFile[],
): Promise<ClassifyResult> {
  const { readFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as {
    assets?: Array<{ kind: AssetKind; file: string }>;
    productSheetPy?: string;
  };

  const inbox = paths(slug).inbox;
  const assets: AssetRecord[] = [];
  const unclassified: Bundle["unclassified"] = [];

  for (const entry of raw.assets ?? []) {
    const match = files.find(
      (file) => file.relative === entry.file || file.name === entry.file,
    );
    if (!match) {
      unclassified.push({
        filename: entry.file,
        path: join(inbox, entry.file),
        reason: "bundle.json names this file and the inbox does not hold it.",
      });
      continue;
    }
    assets.push(await record(match, entry.kind, mimeFor(match.name)));
  }

  return {
    slug,
    assets,
    unclassified,
    productSheetPy: raw.productSheetPy ? join(inbox, raw.productSheetPy) : null,
    classifiedAt: new Date().toISOString(),
  };
}

function mimeFor(name: string): string {
  const extension = extname(name).toLowerCase();
  return VIDEO.get(extension) ?? IMAGE.get(extension) ?? TEXT.get(extension) ?? "application/octet-stream";
}
