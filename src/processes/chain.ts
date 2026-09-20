/**
 * Steps 3, 4 and 5, chained.
 *
 * §18: "Steps 3, 4 and 5 send their artefact and continue in the same pass — a
 * handoff, not an approval. The only gate in the build is step 6." So each of
 * these three runs the next on completion and nothing waits for a person. The
 * handoff used to be a queue enqueue; it is a direct call now, because there is
 * no second process to hand to and §18's rule is about waiting, not transport.
 *
 * What DOES gate, inside a step:
 *   - §19's panel check, before a sheet is used anywhere.
 *   - §30G's property plate, "generated and checked first, before any location
 *     plate is built against it."
 * Both are automatic here, and both are bounded — see checks.ts on why an
 * automatic pass is not recorded as a human one.
 */

import {
  assetText,
  claimStep,
  failStep,
  finishStep,
  findAsset,
  getArtifact,
  putArtifact,
  setStage as setStepStage,
  updateLedger,
} from "@/store";
import {
  actMap as actMapOf,
  captureEvents as captureEventsOf,
  characters as charactersOf,
  claims as claimsOf,
  generationJobs as generationJobsOf,
  generationKey,
  locations as locationsOf,
  phrases as phrasesOf,
  properties as propertiesOf,
  readRoster,
  storyDays as storyDaysOf,
} from "@/store/collections";
import { generationClient, type GenerationClient } from "@/generation/client";
import { report } from "@/lib/report";
import type { GenerationOutcome, GenerationRequest } from "@/generation/runner";
import { deriveCast, generateSheets } from "./cast";
import { deriveLocations, generatePropertyPlates, generateLocationPlates } from "./locations";
import { auditMaps, deriveMaps } from "./maps";
import { panelCheck, propertyPlateCheck, locationPlateCheck } from "./checks";
import type { CastOutput, LocationOutput, MapsOutput } from "./schemas-cast";

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

/** §16B: the manifest is written before the payload so item n can be traced to beat n. */
async function recordManifest(
  slug: string,
  purpose: string,
  requests: GenerationRequest[],
): Promise<void> {
  const jobs = generationJobsOf(slug);
  const existing = await jobs.all();
  const rows = requests.map((request) => ({
    key: generationKey(purpose, request.ref),
    purpose,
    ref: request.ref,
    label: request.label,
    batchIndex: request.index,
    model: request.params.model,
    params: { ...request.params, prompt: undefined },
    prompt: request.params.prompt,
    jobId: null,
    status: "pending",
    loggedModel: null,
    resultUrls: [],
    attempts: 0,
    failures: [],
    createdAt: new Date().toISOString(),
    finishedAt: null,
  }));

  const replaced = new Set(rows.map((row) => row.key));
  await jobs.replaceAll([...existing.filter((row) => !replaced.has(String(row.key))), ...rows]);

  report({
    kind: "manifest",
    purpose,
    items: rows.map((row) => ({
      ref: row.ref,
      label: row.label,
      model: row.model,
      params: row.params as Record<string, unknown>,
    })),
  });
}

/** §16B: every returned job id is written back against its ref, never reported bare. */
async function recordOutcomes(
  slug: string,
  purpose: string,
  outcomes: GenerationOutcome[],
): Promise<void> {
  const jobs = generationJobsOf(slug);
  for (const outcome of outcomes) {
    await jobs.patch(generationKey(purpose, outcome.ref), {
      jobId: outcome.jobId,
      status: outcome.status,
      loggedModel: outcome.loggedModel,
      resultUrls: outcome.resultUrls,
      attempts: outcome.attempts,
      failures: outcome.failures,
      finishedAt: new Date().toISOString(),
    });
  }

  report({
    kind: "outcomes",
    purpose,
    items: outcomes.map((outcome) => ({
      ref: outcome.ref,
      jobId: outcome.jobId,
      status: outcome.status,
      loggedModel: outcome.loggedModel,
      attempts: outcome.attempts,
    })),
  });
}

async function buildContext(slug: string) {
  const ledger = await updateLedger(slug, () => {});
  const phraseRows = await phrasesOf(slug).all();
  const sheetAsset = await findAsset(slug, "product_sheet");
  const absorption = await getArtifact<Record<string, unknown>>(slug, "absorption_sheet");

  return {
    declared: (ledger.declared ?? {}) as Record<string, unknown>,
    phraseInventory: phraseRows.map((row) => ({
      phraseId: row.phraseId,
      text: row.text,
      structuralJob: row.structuralJob ?? null,
    })),
    productSheetText: sheetAsset ? await assetText(sheetAsset) : null,
    absorptionSummary: absorption
      ? {
          styleLock: absorption.styleLock,
          formatRead: absorption.formatRead,
          beatItPlan: absorption.beatItPlan,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ *
 * Step 3 — cast
 * ------------------------------------------------------------------ */

/**
 * §18's handoff is about not waiting for a person, not about transport, so the
 * default is to carry straight on into the next step. `chain: false` exists for
 * re-running one step in isolation after a correction (§34) — it is an operator
 * choice at the command line, never a step deciding to stop on its own.
 */
export interface StepOptions {
  chain?: boolean;
}

export async function runCast(slug: string, options: StepOptions = {}): Promise<void> {
  const claimed = await claimStep(slug, 3, "cast", "CAST — GENERATE REFERENCE SHEETS");
  if (!claimed) return;

  let client: GenerationClient | null = null;

  try {
    const context = await buildContext(slug);

    if (!context.phraseInventory.length) {
      throw new Error("No phrase inventory. Step 3 casts from step 2's inventory — run step 2 first.");
    }

    // The Roster Ledger spans builds: §19A clears a new character against
    // every locked avatar, not just this build's.
    const roster = await readRoster();

    const { cast, usage } = await deriveCast({
      ...context,
      roster: roster.map((entry) => ({
        characterId: entry.characterId,
        name: entry.name,
        axes: (entry.axes ?? {}) as Record<string, unknown>,
      })),
      onStage: (stage) => void setStepStage(slug, 3, stage),
    });

    // Persist before generating, so a generation failure leaves the derivation
    // intact and the step resumes rather than re-deriving a different cast.
    await persistCast(slug, cast);

    client = await generationClient();
    const { outcomes } = await generateSheets(cast, client, {
      onStage: (stage) => void setStepStage(slug, 3, stage),
      onManifest: (manifest) => recordManifest(slug, "avatar_sheet", manifest),
    });
    await recordOutcomes(slug, "avatar_sheet", outcomes);

    // --- §19's panel check, before the sheet is used anywhere.
    await setStepStage(slug, 3, "panel-check");
    for (const outcome of outcomes) {
      const url = outcome.resultUrls[0];

      if (outcome.status !== "completed" || !url) {
        await charactersOf(slug).patch(outcome.ref, {
          sheetStatus: "needs_human",
          sheetJobId: outcome.jobId,
        });
        continue;
      }

      const check = await panelCheck(url);
      await charactersOf(slug).patch(outcome.ref, {
        sheetJobId: outcome.jobId,
        sheetUrl: url,
        panelCheck: check,
        // An automatic pass locks the sheet so the chain proceeds; the human
        // review E1 asks for is queued, not claimed.
        sheetStatus: check.pass ? "locked" : "panel_failed",
      });

      // E3's build-level `subjects{S-id → job_id}`.
      await updateLedger(slug, (ledger) => {
        ledger.subjects[outcome.ref] = check.pass ? outcome.jobId : null;
      });
    }

    await putArtifact(slug, "cast", cast);
    await finishStep(slug, 3, usage);
  } catch (error) {
    await failStep(slug, 3, error);
    throw error;
  } finally {
    await client?.close();
  }

  // §18: send, then straight on.
  if (options.chain !== false) await runLocations(slug, options);
}

async function persistCast(slug: string, cast: CastOutput): Promise<void> {
  // Re-running step 3 replaces this build's cast. Locked sheets from OTHER
  // builds are the roster and live in their own build directories, so they are
  // untouched by construction.
  await charactersOf(slug).replaceAll(
    cast.cast.map((member) => ({ ...member, slug, sheetStatus: "pending" })),
  );

  await updateLedger(slug, (ledger) => {
    ledger.declared.genericClassPool = cast.genericClassPool;
  });
}

/* ------------------------------------------------------------------ *
 * Step 4 — property and locations
 * ------------------------------------------------------------------ */

export async function runLocations(slug: string, options: StepOptions = {}): Promise<void> {
  const claimed = await claimStep(slug, 4, "locations", "PROPERTY AND LOCATION MAPS");
  if (!claimed) return;

  let client: GenerationClient | null = null;

  try {
    const context = await buildContext(slug);
    const cast = await charactersOf(slug).all();

    const { locations, usage } = await deriveLocations({
      phraseInventory: context.phraseInventory,
      declared: context.declared,
      cast: cast.map((member) => ({
        characterId: member.characterId, name: member.name, role: member.role, axes: member.axes,
      })),
      onStage: (stage) => void setStepStage(slug, 4, stage),
    });

    await persistLocations(slug, locations);

    client = await generationClient();

    // --- The property plate first. §30G: checked and locked BEFORE the first
    //     location plate is built against it.
    await setStepStage(slug, 4, "property-plate");
    const propertyOutcomes = await generatePropertyPlates(locations.properties, client, {
      onStage: (stage) => void setStepStage(slug, 4, stage),
      onManifest: (manifest) => recordManifest(slug, "property_plate", manifest),
    });
    await recordOutcomes(slug, "property_plate", propertyOutcomes);

    const readyDwellings = new Map<string, string>();
    for (const outcome of propertyOutcomes) {
      const url = outcome.resultUrls[0];

      if (outcome.status !== "completed" || !url) {
        await propertiesOf(slug).patch(outcome.ref, {
          plateStatus: "needs_human",
          plateJobId: outcome.jobId,
        });
        await recordProperty(slug, outcome.ref, outcome.jobId, null);
        continue;
      }

      const check = await propertyPlateCheck(url);
      await propertiesOf(slug).patch(outcome.ref, {
        plateJobId: outcome.jobId,
        plateUrl: url,
        plateCheck: check,
        plateStatus: check.pass ? "locked" : "plate_failed",
      });
      await recordProperty(slug, outcome.ref, outcome.jobId, check);

      // A media id for the attachment: the platform accepts a prior job_id in
      // `medias[].value`, which avoids a re-upload round trip.
      if (check.pass && outcome.jobId) readyDwellings.set(outcome.ref, outcome.jobId);
    }

    // --- Location plates, for PLATED locations only.
    await setStepStage(slug, 4, "location-plates");
    const plated = locations.locations.filter((l) => l.tier === "PLATED" && l.roomDescription);

    // A dwelling room whose property plate failed is held rather than
    // generated against nothing — that is the "six houses" failure §30G exists
    // to prevent, and it would be invisible in the output.
    const buildable = plated.filter((l) => !l.dwellingId || readyDwellings.has(l.dwellingId));
    const held = plated.filter((l) => l.dwellingId && !readyDwellings.has(l.dwellingId));

    for (const location of held) {
      await locationsOf(slug).patch(location.locationId, {
        plateStatus: "held_property_plate_failed",
      });
    }

    const propertyById = new Map(locations.properties.map((p) => [p.dwellingId, p]));
    const plateInputs = buildable.map((location) => {
      const property = location.dwellingId ? propertyById.get(location.dwellingId) : null;
      return {
        locationId: location.locationId,
        name: location.name,
        roomDescription: location.roomDescription!,
        lightingProfile: location.sheet.lightingProfile,
        anchors: location.anchors,
        property: property
          ? { ...property, plateMediaId: readyDwellings.get(property.dwellingId) ?? null }
          : null,
      };
    });

    const locationOutcomes = await generateLocationPlates(plateInputs, client, {
      onStage: (stage) => void setStepStage(slug, 4, stage),
      onManifest: (manifest) => recordManifest(slug, "location_plate", manifest),
    });
    await recordOutcomes(slug, "location_plate", locationOutcomes);

    await setStepStage(slug, 4, "scene-check");
    for (const outcome of locationOutcomes) {
      const url = outcome.resultUrls[0];
      const input = plateInputs.find((plate) => plate.locationId === outcome.ref);

      if (outcome.status !== "completed" || !url) {
        await locationsOf(slug).patch(outcome.ref, {
          plateStatus: "needs_human",
          plateJobId: outcome.jobId,
        });
        continue;
      }

      const check = await locationPlateCheck(url, input?.anchors ?? []);
      await locationsOf(slug).patch(outcome.ref, {
        plateJobId: outcome.jobId,
        plateUrl: url,
        plateStatus: check.pass ? "locked" : "plate_failed",
        propertyPlateJobId: input?.property?.plateMediaId ?? null,
      });
    }

    // E3: `plates{location → job_id}`, every location row carrying a job id or
    // an explicit null.
    await updateLedger(slug, (ledger) => {
      for (const location of locations.locations) {
        const outcome = locationOutcomes.find((o) => o.ref === location.locationId);
        ledger.plates[location.locationId] = outcome?.jobId ?? null;
      }
    });

    await putArtifact(slug, "locations", locations);
    await finishStep(slug, 4, usage);
  } catch (error) {
    await failStep(slug, 4, error);
    throw error;
  } finally {
    await client?.close();
  }

  if (options.chain !== false) await runMaps(slug);
}

async function recordProperty(
  slug: string,
  dwellingId: string,
  jobId: string | null,
  check: unknown,
): Promise<void> {
  const { paths } = await import("@/store/paths");
  await updateLedger(slug, (ledger) => {
    ledger.property[dwellingId] = {
      sheetPath: paths(slug).collection("properties"),
      plateJobId: jobId,
      plateCheck: check,
    };
  });
}

async function persistLocations(slug: string, output: LocationOutput): Promise<void> {
  await propertiesOf(slug).replaceAll(
    output.properties.map((property) => ({ ...property, plateStatus: "pending" })),
  );

  await locationsOf(slug).replaceAll(
    output.locations.map((location) => ({
      ...location,
      // §30C 1a: a plate is a consistency device, and a room with nothing to be
      // consistent against does not earn one.
      plateStatus: location.tier === "PLATED" ? "pending" : "not_required",
    })),
  );

  // E9 gives Location Sheets their own directory, one file per location.
  const { writeJson } = await import("@/store/json");
  const { paths } = await import("@/store/paths");
  for (const location of output.locations) {
    await writeJson(paths(slug).locationSheet(location.locationId), location);
  }
}

/* ------------------------------------------------------------------ *
 * Step 5 — act map and wardrobe map
 * ------------------------------------------------------------------ */

export async function runMaps(slug: string): Promise<void> {
  const claimed = await claimStep(slug, 5, "maps", "ACT MAP AND WARDROBE MAP");
  if (!claimed) return;

  try {
    const context = await buildContext(slug);
    const cast = await charactersOf(slug).all();
    const locations = await locationsOf(slug).all();
    const claims = await claimsOf(slug).all();

    const declared = context.declared as { genericClassPool?: unknown };

    const { maps, usage } = await deriveMaps({
      phraseInventory: context.phraseInventory,
      claims: claims.map((claim) => ({
        text: claim.text, tier: claim.tier, phraseRef: claim.phraseRef ?? null,
      })),
      cast: cast.map((member) => ({
        characterId: member.characterId,
        name: member.name,
        isNarrator: member.isNarrator,
        wardrobeClasses: member.wardrobeClasses,
        signatureItem: member.signatureItem,
      })),
      genericClassPool: declared.genericClassPool ?? {},
      locations: locations.map((location) => ({
        locationId: location.locationId,
        name: location.name,
        tier: location.tier,
        beatCount: location.beatCount,
        ownership: location.ownership,
      })),
      declared: context.declared,
      absorptionSummary: context.absorptionSummary,
      onStage: (stage) => void setStepStage(slug, 5, stage),
    });

    // The audits are recounted here rather than trusted. §14A and §27B both
    // require the check to travel with the deliverable.
    const audits = auditMaps(maps, context.phraseInventory.map((phrase) => phrase.phraseId));

    await persistMaps(slug, maps, audits);
    await finishStep(slug, 5, usage);
  } catch (error) {
    await failStep(slug, 5, error);
    throw error;
  }
}

async function persistMaps(
  slug: string,
  maps: MapsOutput,
  audits: ReturnType<typeof auditMaps>,
): Promise<void> {
  await storyDaysOf(slug).replaceAll(maps.storyDays.map((day) => ({ ...day })));
  await captureEventsOf(slug).replaceAll(maps.captureEvents.map((event) => ({ ...event })));
  await actMapOf(slug).replaceAll(maps.actMap.map((row) => ({ ...row })));

  // §27B's dispositions land on the phrase rows the inventory already holds.
  const phrases = phrasesOf(slug);
  for (const disposition of maps.dispositions) {
    await phrases.patch(disposition.phraseId, {
      disposition: disposition.disposition,
      demo: disposition.demo ?? null,
      blockedReason: disposition.blockedReason ?? null,
    });
  }

  const { writeJson } = await import("@/store/json");
  const { paths } = await import("@/store/paths");
  // §21 and §14A: the wardrobe map ships with its audits, never without them.
  await writeJson(paths(slug).wardrobeMap, {
    storyDays: maps.storyDays,
    captureEvents: maps.captureEvents,
    wardrobeAudits: maps.wardrobeAudits,
    independentAudits: audits,
  });

  // E3: `story_days{day → outfit_row}` and `capture_events{event_id → …}`, and
  // one ledger row per beat so step 6 onward has somewhere to write.
  await updateLedger(slug, (ledger) => {
    for (const day of maps.storyDays) ledger.storyDays[day.day] = day;

    for (const event of maps.captureEvents) {
      ledger.captureEvents[event.eventId] = {
        storyDay: event.storyDay,
        locationId: event.locationId,
        beats: event.beats,
      };
    }

    for (const row of maps.actMap) {
      const existing = ledger.beats[row.beatId];
      ledger.beats[row.beatId] = existing
        ? { ...existing, phraseIds: row.phraseIds }
        : blankBeat(row.beatId, row.phraseIds);
    }
  });

  await putArtifact(slug, "maps", { ...maps, independentAudits: audits });
}

function blankBeat(beatId: string, phraseIds: string[]) {
  return {
    beatId,
    phraseIds,
    t2iPromptPath: null,
    t2iJobId: null,
    t2iStatus: null,
    t2iQa: {},
    i2vPromptPath: null,
    i2vJobId: null,
    i2vStatus: null,
    i2vQa: {},
    retries: [],
    attachments: [],
    delivered: false,
    reissueFlag: null,
  };
}
