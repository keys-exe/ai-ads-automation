/**
 * The build record, its bundle, its step state and its step artefacts.
 *
 * This replaces the `builds`, `assets`, `processes` and `artifacts` tables. The
 * step state lives inside `run_ledger.json` rather than beside it, because E3
 * names the ledger as the source for "resume-after-interruption" and two files
 * disagreeing about which step finished is exactly the drift it exists to stop.
 */

import { readdir, stat } from "node:fs/promises";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { BUILDS_ROOT, buildDir, paths, assertSlug } from "./paths";
import { readJson, writeJson } from "./json";
import { emptyLedger, readLedger, updateLedger, type StepState } from "./ledger";
import { report } from "@/lib/report";

/** §18 step 2's asset kinds. Placement and sheet are optional (§9D, §18). */
export const ASSET_KINDS = [
  "inspo_video",
  "script",
  "product",
  "product_sheet",
  "product_placement",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export interface AssetRecord {
  kind: AssetKind;
  filename: string;
  /** Absolute path on disk. The instruments take a path, so nothing is staged. */
  path: string;
  mimeType: string;
  byteSize: number;
}

export interface Bundle {
  slug: string;
  assets: AssetRecord[];
  /** Files the classifier could not place. Reported, never guessed at. */
  unclassified: Array<{ filename: string; path: string; reason: string }>;
  classifiedAt: string;
}

export interface BuildRecord {
  slug: string;
  name: string;
  standardsVersion: string;
  createdAt: string;
  updatedAt: string;
}

export async function createBuild(
  slug: string,
  name: string,
  standardsVersion: string,
): Promise<BuildRecord> {
  assertSlug(slug);
  const existing = await readBuild(slug);
  if (existing) return existing;

  const now = new Date().toISOString();
  const record: BuildRecord = { slug, name, standardsVersion, createdAt: now, updatedAt: now };
  await writeJson(paths(slug).build, record);

  // The ledger is created with the build so `version_built_against` is set
  // before any step runs against it (E3).
  if (!(await readLedger(slug))) {
    await writeJson(paths(slug).ledger, emptyLedger(standardsVersion));
  }
  return record;
}

export async function readBuild(slug: string): Promise<BuildRecord | undefined> {
  return readJson<BuildRecord>(paths(slug).build);
}

export async function requireBuild(slug: string): Promise<BuildRecord> {
  const build = await readBuild(slug);
  if (!build) {
    throw new Error(
      `No build named "${slug}". Put its bundle in ${paths(slug).inbox} and run the build to create it.`,
    );
  }
  return build;
}

export async function listBuilds(): Promise<BuildRecord[]> {
  let entries: string[];
  try {
    entries = await readdir(BUILDS_ROOT);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const builds: BuildRecord[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const info = await stat(buildDir(entry)).catch(() => null);
    if (!info?.isDirectory()) continue;
    const record = await readBuild(entry).catch(() => undefined);
    if (record) builds.push(record);
  }
  return builds.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* ------------------------------------------------------------------ *
 * The bundle
 * ------------------------------------------------------------------ */

export async function saveBundle(slug: string, bundle: Bundle): Promise<void> {
  await writeJson(paths(slug).bundle, bundle);
}

export async function readBundle(slug: string): Promise<Bundle | undefined> {
  return readJson<Bundle>(paths(slug).bundle);
}

export async function listAssets(slug: string, kind?: AssetKind): Promise<AssetRecord[]> {
  const bundle = await readBundle(slug);
  const assets = bundle?.assets ?? [];
  return kind ? assets.filter((asset) => asset.kind === kind) : assets;
}

export async function findAsset(slug: string, kind: AssetKind): Promise<AssetRecord | undefined> {
  return (await listAssets(slug, kind))[0];
}

export async function assetText(asset: AssetRecord): Promise<string> {
  return readFile(asset.path, "utf8");
}

export async function assetImage(
  asset: AssetRecord,
): Promise<{ filename: string; mediaType: string; base64: string }> {
  const bytes = await readFile(asset.path);
  return {
    filename: basename(asset.path),
    mediaType: asset.mimeType,
    base64: bytes.toString("base64"),
  };
}

/* ------------------------------------------------------------------ *
 * Step state — the `processes` table, folded into the ledger
 * ------------------------------------------------------------------ */

/**
 * Move a step to `running`, but only from a state that is not already running.
 *
 * This is the conditional UPDATE that used to be the lock. In one process the
 * race it guarded against cannot happen, but the guard still earns its place:
 * it makes a re-run of a step that is already in flight a no-op instead of two
 * writers on one ledger.
 */
export async function claimStep(
  slug: string,
  step: number,
  kind: string,
  label: string,
): Promise<StepState | undefined> {
  let claimed: StepState | undefined;

  await updateLedger(slug, (ledger) => {
    const current = ledger.steps[String(step)];
    if (current?.status === "running") return;

    const state: StepState = {
      step,
      kind,
      label,
      status: "running",
      stage: "starting",
      error: null,
      usage: current?.usage ?? {},
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    ledger.steps[String(step)] = state;
    claimed = state;
  });

  if (claimed) report({ kind: "step-start", step, label });
  return claimed;
}

export async function setStage(slug: string, step: number, stage: string): Promise<void> {
  await updateLedger(slug, (ledger) => {
    const state = ledger.steps[String(step)];
    if (state) state.stage = stage;
  });
  report({ kind: "stage", step, stage });
}

export async function finishStep(slug: string, step: number, usage: unknown): Promise<void> {
  await updateLedger(slug, (ledger) => {
    const state = ledger.steps[String(step)];
    if (!state) return;
    state.status = "done";
    state.stage = "done";
    state.usage = usage ?? {};
    state.finishedAt = new Date().toISOString();
  });
  report({ kind: "step-done", step, usage });
}

export async function failStep(slug: string, step: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await updateLedger(slug, (ledger) => {
    const state = ledger.steps[String(step)];
    if (!state) return;
    state.status = "failed";
    state.stage = "failed";
    state.error = message.slice(0, 4000);
    state.finishedAt = new Date().toISOString();
  });
  report({ kind: "step-failed", step, error: message });
}

export async function stepState(slug: string, step: number): Promise<StepState | undefined> {
  return (await readLedger(slug))?.steps[String(step)];
}

/* ------------------------------------------------------------------ *
 * Step artefacts
 * ------------------------------------------------------------------ */

/**
 * One file per (build, kind): re-running a step replaces its artefact rather
 * than accumulating versions that then have to be disambiguated — the same
 * rule the SQL comment stated, now enforced by the filename.
 */
export async function putArtifact(slug: string, kind: string, payload: unknown): Promise<void> {
  await writeJson(paths(slug).artifact(kind), payload);
}

export async function getArtifact<T>(slug: string, kind: string): Promise<T | undefined> {
  return readJson<T>(paths(slug).artifact(kind));
}
