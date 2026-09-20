/**
 * Steps 1 and 2 — absorb the inspo video, absorb the script and product.
 *
 * Every state change goes through here rather than through the caller so both
 * steps share one definition of what "running", "done" and "failed" mean, and
 * so the ledger has a single writer.
 *
 * §18 is explicit that neither step gates the other: "steps 1-5 ship as one
 * delivery and nothing inside waits — the only gate in the build is step 6."
 * Step 2 therefore reads step 1's sheet as context where it exists, and runs
 * without it where it does not.
 */

import {
  assetImage,
  assetText,
  claimStep,
  failStep,
  finishStep,
  findAsset,
  getArtifact,
  listAssets,
  putArtifact,
  setStage as setStepStage,
  updateLedger,
} from "@/store";
import { claims as claimsOf, locks as locksOf, phrases as phrasesOf } from "@/store/collections";
import { absorbInspoVideo } from "./absorb-inspo";
import { absorbScript } from "./absorb-script";
import { part1Table } from "@/instruments";
import type { AbsorptionSheet } from "./schemas";

/* ------------------------------------------------------------------ *
 * Step 1 — absorb the inspo video
 * ------------------------------------------------------------------ */

export async function runAbsorbInspo(slug: string): Promise<void> {
  const claimed = await claimStep(slug, 1, "absorb_inspo", "ABSORB INSPO VIDEO");
  if (!claimed) return;

  try {
    const video = await findAsset(slug, "inspo_video");
    if (!video) throw new Error("No inspo video in this build's bundle.");

    // The instruments take a path and the asset already is one — nothing is
    // staged to a temporary file and nothing has to be cleaned up after.
    const result = await absorbInspoVideo({
      videoPath: video.path,
      onStage: (stage) => void setStepStage(slug, 1, stage),
    });

    await putArtifact(slug, "measurements", {
      ...result.measurements,
      part1Table: part1Table(result.measurements),
    });
    await putArtifact(slug, "absorption_sheet", result.sheet);
    await finishStep(slug, 1, result.usage);
  } catch (error) {
    await failStep(slug, 1, error);
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Step 2 — absorb script, product, Product Sheet; lock mode and model
 * ------------------------------------------------------------------ */

export async function runAbsorbScript(slug: string): Promise<void> {
  const claimed = await claimStep(
    slug,
    2,
    "absorb_script",
    await stepTwoLabel(slug),
  );
  if (!claimed) return;

  try {
    const script = await findAsset(slug, "script");
    if (!script) throw new Error("No script in this build's bundle.");
    const scriptText = await assetText(script);

    const sheetAsset = await findAsset(slug, "product_sheet");
    const productSheetText = sheetAsset ? await assetText(sheetAsset) : null;

    const productImages = await Promise.all(
      (await listAssets(slug, "product")).map(assetImage),
    );
    const placementImages = await Promise.all(
      (await listAssets(slug, "product_placement")).map(assetImage),
    );

    // Step 1's sheet, where it has run. §18 lets step 2 proceed without it, so
    // this is context, not a precondition.
    const priorSheet = await getArtifact<AbsorptionSheet>(slug, "absorption_sheet");

    const result = await absorbScript({
      scriptText,
      productSheetText,
      productImages,
      placementImages,
      absorptionSheet: priorSheet ?? null,
      onStage: (stage) => void setStepStage(slug, 2, stage),
    });

    await persistScriptAbsorption(slug, result.absorption);
    await finishStep(slug, 2, result.usage);
  } catch (error) {
    await failStep(slug, 2, error);
    throw error;
  }
}

/**
 * §18 step 2's label carries its `PRODUCT PLACEMENT` clause only when a
 * placement reference is in the bundle.
 *
 * That is not cosmetic: with no worn-placement reference §9D blocks REVEAL
 * beats until one exists, and the recorded label is the evidence of what the
 * bundle actually held.
 */
async function stepTwoLabel(slug: string): Promise<string> {
  const hasPlacement = (await listAssets(slug, "product_placement")).length > 0;
  return hasPlacement
    ? "ABSORB THIS SCRIPT, PRODUCT, PRODUCT PLACEMENT AND PRODUCT SHEET"
    : "ABSORB THIS SCRIPT, PRODUCT AND PRODUCT SHEET";
}

async function persistScriptAbsorption(
  slug: string,
  absorption: Awaited<ReturnType<typeof absorbScript>>["absorption"],
): Promise<void> {
  // Re-running step 2 replaces the inventory rather than appending to it;
  // §27B requires contiguous P- numbering and a second run would break it.
  await phrasesOf(slug).replaceAll(
    absorption.phraseInventory.map((row) => ({ ...row })),
  );

  await claimsOf(slug).replaceAll(absorption.claims.map((claim) => ({ ...claim })));

  // The mode lock appears both in `modeLock` and, for some models, again in
  // `locks`. First wins, which is what ON CONFLICT DO NOTHING did.
  const lockRows = [
    { key: "mode", value: absorption.modeLock.mode, section: "18A", reason: absorption.modeLock.reason ?? null },
    ...absorption.locks.map((lock) => ({
      key: lock.key, value: lock.value, section: lock.section, reason: lock.reason ?? null,
    })),
    ...absorption.modelRoutes.map((route) => ({
      key: `model:${route.beatClass}`,
      value: [route.model, route.variant, route.quality, route.resolution].filter(Boolean).join(" · "),
      section: "18A",
      reason: route.reason ?? null,
    })),
  ];

  const seen = new Set<string>();
  await locksOf(slug).replaceAll(
    lockRows.filter((row) => (seen.has(row.key) ? false : (seen.add(row.key), true))),
  );

  await putArtifact(slug, "script_absorption", absorption);

  // E3's build-level `declared{}`, written at step 2.
  await updateLedger(slug, (ledger) => {
    ledger.declared = {
      ...ledger.declared,
      mode: absorption.modeLock.mode,
      hybridByAct: absorption.modeLock.hybridByAct,
      modelLock: Object.fromEntries(
        absorption.modelRoutes.map((route) => [
          route.beatClass,
          {
            model: route.model,
            variant: route.variant ?? null,
            quality: route.quality ?? null,
            resolution: route.resolution ?? null,
          },
        ]),
      ),
      locks: Object.fromEntries(absorption.locks.map((lock) => [lock.key, lock.value])),
      placement: absorption.placementLock,
    };
  });
}
