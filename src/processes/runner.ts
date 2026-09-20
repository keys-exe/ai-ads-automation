/**
 * Runs a process row end to end: claim it, execute the step, persist its
 * artefacts, release it.
 *
 * Every state change goes through here rather than through the worker so the
 * two steps share one definition of what "running", "done" and "failed" mean,
 * and so the UI's progress column has a single writer.
 */

import { readFile } from "node:fs/promises";
import { one, query, transaction } from "@/db/client";
import { resolveStoragePath } from "@/lib/storage";
import { absorbInspoVideo } from "./absorb-inspo";
import { absorbScript } from "./absorb-script";
import { part1Table } from "@/instruments";
import type { AbsorptionSheet } from "./schemas";

interface ProcessRow extends Record<string, unknown> {
  id: number;
  build_id: number;
  step: number;
  kind: string;
  status: string;
}

interface AssetRow extends Record<string, unknown> {
  id: number;
  kind: string;
  filename: string;
  mime_type: string;
  storage_path: string;
  source_url: string | null;
  text_content: string | null;
}

export async function setStage(processId: number, stage: string): Promise<void> {
  await query("UPDATE processes SET stage = $2 WHERE id = $1", [processId, stage]);
}

/**
 * Move a process to `running`, but only from `queued`. The conditional update
 * is the lock: if two workers pick up the same job, exactly one sees a row
 * back and the other returns false and does nothing.
 */
async function claim(processId: number): Promise<ProcessRow | undefined> {
  return one<ProcessRow>(
    `UPDATE processes
        SET status = 'running', started_at = now(), stage = 'starting', error = NULL
      WHERE id = $1 AND status = 'queued'
      RETURNING *`,
    [processId],
  );
}

async function fail(processId: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await query(
    `UPDATE processes SET status = 'failed', error = $2, stage = 'failed', finished_at = now() WHERE id = $1`,
    [processId, message.slice(0, 4000)],
  );
}

async function assetsFor(buildId: number): Promise<AssetRow[]> {
  return query<AssetRow>("SELECT * FROM assets WHERE build_id = $1 ORDER BY id", [buildId]);
}

async function saveArtifact(
  buildId: number,
  processId: number,
  kind: string,
  payload: unknown,
): Promise<void> {
  // One row per (build, kind): re-running a step replaces its artefact rather
  // than accumulating versions the UI would then have to disambiguate.
  await query(
    `INSERT INTO artifacts (build_id, process_id, kind, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [buildId, processId, kind, JSON.stringify(payload)],
  );
}

/* ------------------------------------------------------------------ */

export async function runAbsorbInspo(processId: number): Promise<void> {
  const proc = await claim(processId);
  if (!proc) return;

  try {
    const assets = await assetsFor(proc.build_id);
    const video = assets.find((a) => a.kind === "inspo_video");
    if (!video) throw new Error("No inspo video in this build's bundle.");

    const result = await absorbInspoVideo({
      videoPath: resolveStoragePath(video.storage_path),
      onStage: (stage) => void setStage(processId, stage),
    });

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO artifacts (build_id, process_id, kind, payload) VALUES ($1, $2, 'measurements', $3::jsonb)`,
        [proc.build_id, processId, JSON.stringify({
          ...result.measurements,
          part1Table: part1Table(result.measurements),
        })],
      );
      await client.query(
        `INSERT INTO artifacts (build_id, process_id, kind, payload) VALUES ($1, $2, 'absorption_sheet', $3::jsonb)`,
        [proc.build_id, processId, JSON.stringify(result.sheet)],
      );
      await client.query(
        `UPDATE processes SET status = 'done', stage = 'done', finished_at = now(), usage = $2::jsonb WHERE id = $1`,
        [processId, JSON.stringify(result.usage)],
      );
    });
  } catch (error) {
    await fail(processId, error);
    throw error;
  }
}

export async function runAbsorbScript(processId: number): Promise<void> {
  const proc = await claim(processId);
  if (!proc) return;

  try {
    const assets = await assetsFor(proc.build_id);

    const script = assets.find((a) => a.kind === "script");
    if (!script) throw new Error("No script in this build's bundle.");
    const scriptText = script.text_content
      ?? (await readFile(resolveStoragePath(script.storage_path), "utf8"));

    const sheetAsset = assets.find((a) => a.kind === "product_sheet");
    const productSheetText = sheetAsset
      ? sheetAsset.text_content ?? (await readFile(resolveStoragePath(sheetAsset.storage_path), "utf8"))
      : null;

    const toImage = async (a: AssetRow) => ({
      filename: a.filename,
      mediaType: a.mime_type,
      base64: (await readFile(resolveStoragePath(a.storage_path))).toString("base64"),
    });

    const productImages = await Promise.all(assets.filter((a) => a.kind === "product").map(toImage));
    const placementImages = await Promise.all(
      assets.filter((a) => a.kind === "product_placement").map(toImage),
    );

    // Step 1's sheet, where it has run. §18 lets step 2 proceed without it —
    // steps 1-5 ship as one delivery and nothing inside waits — so this is
    // context, not a precondition.
    const priorSheet = await one<{ payload: AbsorptionSheet }>(
      `SELECT payload FROM artifacts
        WHERE build_id = $1 AND kind = 'absorption_sheet'
        ORDER BY created_at DESC LIMIT 1`,
      [proc.build_id],
    );

    const result = await absorbScript({
      scriptText,
      productSheetText,
      productImages,
      placementImages,
      absorptionSheet: priorSheet?.payload ?? null,
      onStage: (stage) => void setStage(processId, stage),
    });

    await persistScriptAbsorption(proc.build_id, processId, result.absorption, result.usage);
  } catch (error) {
    await fail(processId, error);
    throw error;
  }
}

async function persistScriptAbsorption(
  buildId: number,
  processId: number,
  absorption: Awaited<ReturnType<typeof absorbScript>>["absorption"],
  usage: Awaited<ReturnType<typeof absorbScript>>["usage"],
): Promise<void> {
  await transaction(async (client) => {
    // Re-running step 2 replaces the inventory rather than appending to it;
    // §27B requires contiguous P- numbering and a second run would break it.
    await client.query("DELETE FROM phrases WHERE build_id = $1", [buildId]);
    for (const row of absorption.phraseInventory) {
      await client.query(
        `INSERT INTO phrases (build_id, phrase_id, ordinal, text, structural_job, split_trigger, act)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [buildId, row.phraseId, row.ordinal, row.text, row.structuralJob, row.splitTrigger, row.actHint],
      );
    }

    await client.query("DELETE FROM claims WHERE build_id = $1 AND resolved_at IS NULL", [buildId]);
    for (const claim of absorption.claims) {
      await client.query(
        `INSERT INTO claims (build_id, text, tier, kind, source, qualification, phrase_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [buildId, claim.text, claim.tier, claim.kind, claim.source, claim.qualification, claim.phraseRef],
      );
    }

    await client.query("DELETE FROM locks WHERE build_id = $1", [buildId]);
    const lockRows: Array<[string, string, string, string | null]> = [
      ["mode", absorption.modeLock.mode, "18A", absorption.modeLock.reason],
      ...absorption.locks.map((l): [string, string, string, string | null] => [l.key, l.value, l.section, l.reason]),
      ...absorption.modelRoutes.map((r): [string, string, string, string | null] => [
        `model:${r.beatClass}`,
        [r.model, r.variant, r.quality, r.resolution].filter(Boolean).join(" · "),
        "18A",
        r.reason,
      ]),
    ];
    for (const [key, value, section, reason] of lockRows) {
      // ON CONFLICT rather than a pre-check: the model can emit the same lock
      // key twice (mode both in modeLock and locks), and the first wins.
      await client.query(
        `INSERT INTO locks (build_id, key, value, section, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (build_id, key) DO NOTHING`,
        [buildId, key, value, section, reason],
      );
    }

    await client.query(
      `INSERT INTO artifacts (build_id, process_id, kind, payload) VALUES ($1, $2, 'script_absorption', $3::jsonb)`,
      [buildId, processId, JSON.stringify(absorption)],
    );

    // §E3 build-level `declared{}`, written at step 2.
    await client.query(
      `UPDATE builds SET declared = $2::jsonb, updated_at = now() WHERE id = $1`,
      [buildId, JSON.stringify({
        mode: absorption.modeLock.mode,
        hybrid_by_act: absorption.modeLock.hybridByAct,
        model_lock: Object.fromEntries(
          absorption.modelRoutes.map((r) => [r.beatClass, {
            model: r.model, variant: r.variant, quality: r.quality, resolution: r.resolution,
          }]),
        ),
        locks: Object.fromEntries(absorption.locks.map((l) => [l.key, l.value])),
        placement: absorption.placementLock,
      })],
    );

    await client.query(
      `UPDATE processes SET status = 'done', stage = 'done', finished_at = now(), usage = $2::jsonb WHERE id = $1`,
      [processId, JSON.stringify(usage)],
    );
  });
}
