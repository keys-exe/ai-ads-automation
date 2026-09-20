/**
 * Steps 3, 4 and 5, chained.
 *
 * §18: "Steps 3, 4 and 5 send their artefact and continue in the same pass — a
 * handoff, not an approval. The only gate in the build is step 6." So each of
 * these three enqueues the next on completion and nothing waits for a person.
 *
 * What DOES gate, inside a step:
 *   - §19's panel check, before a sheet is used anywhere.
 *   - §30G's property plate, "generated and checked first, before any location
 *     plate is built against it."
 * Both are automatic here, and both are bounded — see checks.ts on why an
 * automatic pass is not recorded as a human one.
 */

import { one, query, transaction } from "@/db/client";
import { enqueue, QUEUE_ABSORB_SCRIPT, QUEUE_CAST, QUEUE_LOCATIONS, QUEUE_MAPS } from "@/worker/queue";
import { generationClientFromEnv, type GenerationClient } from "@/generation/client";
import type { GenerationOutcome, GenerationRequest } from "@/generation/runner";
import { deriveCast, generateSheets } from "./cast";
import { deriveLocations, generatePropertyPlates, generateLocationPlates } from "./locations";
import { auditMaps, deriveMaps } from "./maps";
import { panelCheck, propertyPlateCheck, locationPlateCheck } from "./checks";
import type { CastOutput, LocationOutput, MapsOutput } from "./schemas-cast";

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

interface ProcessRow extends Record<string, unknown> {
  id: number;
  build_id: number;
  step: number;
}

async function claim(processId: number): Promise<ProcessRow | undefined> {
  return one<ProcessRow>(
    `UPDATE processes SET status = 'running', started_at = now(), stage = 'starting', error = NULL
      WHERE id = $1 AND status = 'queued' RETURNING *`,
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

async function setStage(processId: number, stage: string): Promise<void> {
  await query("UPDATE processes SET stage = $2 WHERE id = $1", [processId, stage]);
}

async function finish(processId: number, usage: unknown): Promise<void> {
  await query(
    `UPDATE processes SET status = 'done', stage = 'done', finished_at = now(), usage = $2::jsonb WHERE id = $1`,
    [processId, JSON.stringify(usage ?? {})],
  );
}

/**
 * Create the next step's process row and enqueue it.
 *
 * §18's handoff. A step that completes without handing off would stall the
 * chain silently, so this is called from the success path of every step.
 */
async function handOff(buildId: number, step: 4 | 5, label: string, queue: string): Promise<void> {
  const existing = await one<{ id: number }>(
    `SELECT id FROM processes WHERE build_id = $1 AND step = $2 AND status IN ('queued','running')`,
    [buildId, step],
  );
  if (existing) return;

  const proc = await one<{ id: number }>(
    `INSERT INTO processes (build_id, step, kind, prompt_label, status, stage)
     VALUES ($1, $2, $3, $4, 'queued', 'queued') RETURNING id`,
    [buildId, step, step === 4 ? "locations" : "maps", label],
  );
  const jobId = await enqueue(queue, { processId: proc!.id, buildId });
  await query(`UPDATE processes SET queue_job_id = $2 WHERE id = $1`, [proc!.id, jobId]);
}

/** §16B: the manifest is written before the payload so item n can be traced to beat n. */
async function recordManifest(
  buildId: number,
  processId: number,
  purpose: string,
  requests: GenerationRequest[],
): Promise<void> {
  for (const request of requests) {
    await query(
      `INSERT INTO generation_jobs (build_id, process_id, purpose, ref, label, batch_index, model, params, prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        buildId, processId, purpose, request.ref, request.label, request.index,
        request.params.model,
        JSON.stringify({ ...request.params, prompt: undefined }),
        request.params.prompt,
      ],
    );
  }
}

/** §16B: every returned job id is written back against its ref, never reported bare. */
async function recordOutcomes(
  buildId: number,
  purpose: string,
  outcomes: GenerationOutcome[],
): Promise<void> {
  for (const outcome of outcomes) {
    await query(
      `UPDATE generation_jobs
          SET job_id = $4, status = $5, logged_model = $6, result_urls = $7::jsonb,
              attempts = $8, failures = $9::jsonb, finished_at = now()
        WHERE build_id = $1 AND purpose = $2 AND ref = $3`,
      [
        buildId, purpose, outcome.ref, outcome.jobId, outcome.status, outcome.loggedModel,
        JSON.stringify(outcome.resultUrls), outcome.attempts, JSON.stringify(outcome.failures),
      ],
    );
  }
}

async function buildContext(buildId: number) {
  const build = await one<{ declared: Record<string, unknown> }>(
    `SELECT declared FROM builds WHERE id = $1`, [buildId],
  );

  const phrases = await query<{ phrase_id: string; text: string; structural_job: string | null }>(
    `SELECT phrase_id, text, structural_job FROM phrases WHERE build_id = $1 ORDER BY ordinal`,
    [buildId],
  );

  const sheetAsset = await one<{ text_content: string | null }>(
    `SELECT text_content FROM assets WHERE build_id = $1 AND kind = 'product_sheet' LIMIT 1`,
    [buildId],
  );

  const absorption = await one<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM artifacts WHERE build_id = $1 AND kind = 'absorption_sheet' ORDER BY id DESC LIMIT 1`,
    [buildId],
  );

  return {
    declared: build?.declared ?? {},
    phraseInventory: phrases.map((p) => ({
      phraseId: p.phrase_id, text: p.text, structuralJob: p.structural_job,
    })),
    productSheetText: sheetAsset?.text_content ?? null,
    absorptionSummary: absorption
      ? {
          styleLock: absorption.payload.styleLock,
          formatRead: absorption.payload.formatRead,
          beatItPlan: absorption.payload.beatItPlan,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ *
 * Step 3 — cast
 * ------------------------------------------------------------------ */

export async function runCast(processId: number): Promise<void> {
  const proc = await claim(processId);
  if (!proc) return;

  let client: GenerationClient | null = null;

  try {
    const buildId = proc.build_id;
    const context = await buildContext(buildId);

    if (!context.phraseInventory.length) {
      throw new Error("No phrase inventory. Step 3 casts from step 2's inventory — run step 2 first.");
    }

    // The Roster Ledger spans builds: §19A clears a new character against
    // every locked avatar, not just this build's.
    const roster = await query<{ character_id: string; name: string; axes: Record<string, unknown> }>(
      `SELECT character_id, name, axes FROM characters WHERE sheet_status = 'locked' ORDER BY id`,
    );

    const { cast, usage } = await deriveCast({
      ...context,
      roster: roster.map((r) => ({ characterId: r.character_id, name: r.name, axes: r.axes })),
      onStage: (s) => void setStage(processId, s),
    });

    // Persist before generating, so a generation failure leaves the derivation
    // intact and the step resumes rather than re-deriving a different cast.
    await persistCast(buildId, cast);

    client = generationClientFromEnv();
    const { outcomes, requests } = await generateSheets(cast, client, {
      onStage: (s) => void setStage(processId, s),
      onManifest: (m) => recordManifest(buildId, processId, "avatar_sheet", m),
    });
    await recordOutcomes(buildId, "avatar_sheet", outcomes);

    // --- §19's panel check, before the sheet is used anywhere.
    await setStage(processId, "panel-check");
    for (const outcome of outcomes) {
      const url = outcome.resultUrls[0];
      if (outcome.status !== "completed" || !url) {
        await query(
          `UPDATE characters SET sheet_status = 'needs_human', sheet_job_id = $3 WHERE build_id = $1 AND character_id = $2`,
          [buildId, outcome.ref, outcome.jobId],
        );
        continue;
      }

      const check = await panelCheck(url);
      await query(
        `UPDATE characters
            SET sheet_job_id = $3, sheet_url = $4, panel_check = $5::jsonb, sheet_status = $6
          WHERE build_id = $1 AND character_id = $2`,
        [
          buildId, outcome.ref, outcome.jobId, url, JSON.stringify(check),
          // An automatic pass locks the sheet so the chain proceeds; the
          // human review E1 asks for is queued, not claimed.
          check.pass ? "locked" : "panel_failed",
        ],
      );
    }

    await query(
      `INSERT INTO artifacts (build_id, process_id, kind, payload) VALUES ($1, $2, 'cast', $3::jsonb)`,
      [buildId, processId, JSON.stringify(cast)],
    );

    await finish(processId, usage);

    // §18: send, then straight on.
    await handOff(buildId, 4, "PROPERTY AND LOCATION MAPS", QUEUE_LOCATIONS);
  } catch (error) {
    await fail(processId, error);
    throw error;
  } finally {
    await client?.close();
  }
}

async function persistCast(buildId: number, cast: CastOutput): Promise<void> {
  await transaction(async (db) => {
    // Re-running step 3 replaces this build's cast. Locked sheets from OTHER
    // builds are the roster and are never touched.
    await db.query(`DELETE FROM characters WHERE build_id = $1`, [buildId]);

    for (const member of cast.cast) {
      await db.query(
        `INSERT INTO characters
           (build_id, character_id, name, role, is_narrator, speaks, beat_count,
            axes, clearance, voice, constraint_sheet, wardrobe_classes, signature_item, sheet_prompt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14)`,
        [
          buildId, member.characterId, member.name, member.role, member.isNarrator,
          member.speaks, member.beatCount,
          JSON.stringify({ ...member.axes, derivation: member.derivation }),
          JSON.stringify(member.clearance),
          member.voice ? JSON.stringify(member.voice) : null,
          member.constraintSheet ? JSON.stringify(member.constraintSheet) : null,
          JSON.stringify(member.wardrobeClasses),
          member.signatureItem,
          JSON.stringify(member.sheetFill),
        ],
      );
    }

    await db.query(
      `UPDATE builds SET declared = declared || $2::jsonb, updated_at = now() WHERE id = $1`,
      [buildId, JSON.stringify({ generic_class_pool: cast.genericClassPool })],
    );
  });
}

/* ------------------------------------------------------------------ *
 * Step 4 — property and locations
 * ------------------------------------------------------------------ */

export async function runLocations(processId: number): Promise<void> {
  const proc = await claim(processId);
  if (!proc) return;

  let client: GenerationClient | null = null;

  try {
    const buildId = proc.build_id;
    const context = await buildContext(buildId);

    const cast = await query<{ character_id: string; name: string; role: string; axes: Record<string, unknown> }>(
      `SELECT character_id, name, role, axes FROM characters WHERE build_id = $1 ORDER BY id`,
      [buildId],
    );

    const { locations, usage } = await deriveLocations({
      phraseInventory: context.phraseInventory,
      declared: context.declared,
      cast: cast.map((c) => ({ characterId: c.character_id, name: c.name, role: c.role, axes: c.axes })),
      onStage: (s) => void setStage(processId, s),
    });

    await persistLocations(buildId, locations);

    client = generationClientFromEnv();

    // --- The property plate first. §30G: checked and locked BEFORE the first
    //     location plate is built against it.
    await setStage(processId, "property-plate");
    const propertyOutcomes = await generatePropertyPlates(locations.properties, client, {
      onStage: (s) => void setStage(processId, s),
      onManifest: (m) => recordManifest(buildId, processId, "property_plate", m),
    });
    await recordOutcomes(buildId, "property_plate", propertyOutcomes);

    const readyDwellings = new Map<string, string>();
    for (const outcome of propertyOutcomes) {
      const url = outcome.resultUrls[0];
      if (outcome.status !== "completed" || !url) {
        await query(
          `UPDATE properties SET plate_status = 'needs_human', plate_job_id = $3 WHERE build_id = $1 AND dwelling_id = $2`,
          [buildId, outcome.ref, outcome.jobId],
        );
        continue;
      }
      const check = await propertyPlateCheck(url);
      await query(
        `UPDATE properties SET plate_job_id = $3, plate_url = $4, plate_check = $5::jsonb, plate_status = $6
          WHERE build_id = $1 AND dwelling_id = $2`,
        [buildId, outcome.ref, outcome.jobId, url, JSON.stringify(check), check.pass ? "locked" : "plate_failed"],
      );
      // A media id for the attachment: the platform accepts a prior job_id in
      // `medias[].value`, which avoids a re-upload round trip.
      if (check.pass && outcome.jobId) readyDwellings.set(outcome.ref, outcome.jobId);
    }

    // --- Location plates, for PLATED locations only.
    await setStage(processId, "location-plates");
    const plated = locations.locations.filter((l) => l.tier === "PLATED" && l.roomDescription);

    // A dwelling room whose property plate failed is held rather than
    // generated against nothing — that is the "six houses" failure §30G exists
    // to prevent, and it would be invisible in the output.
    const buildable = plated.filter((l) => !l.dwellingId || readyDwellings.has(l.dwellingId));
    const held = plated.filter((l) => l.dwellingId && !readyDwellings.has(l.dwellingId));

    for (const location of held) {
      await query(
        `UPDATE locations SET plate_status = 'held_property_plate_failed' WHERE build_id = $1 AND location_id = $2`,
        [buildId, location.locationId],
      );
    }

    const propertyById = new Map(locations.properties.map((p) => [p.dwellingId, p]));
    const plateInputs = buildable.map((l) => {
      const property = l.dwellingId ? propertyById.get(l.dwellingId) : null;
      return {
        locationId: l.locationId,
        name: l.name,
        roomDescription: l.roomDescription!,
        lightingProfile: l.sheet.lightingProfile,
        anchors: l.anchors,
        property: property
          ? { ...property, plateMediaId: readyDwellings.get(property.dwellingId) ?? null }
          : null,
      };
    });

    const locationOutcomes = await generateLocationPlates(plateInputs, client, {
      onStage: (s) => void setStage(processId, s),
      onManifest: (m) => recordManifest(buildId, processId, "location_plate", m),
    });
    await recordOutcomes(buildId, "location_plate", locationOutcomes);

    await setStage(processId, "scene-check");
    for (const outcome of locationOutcomes) {
      const url = outcome.resultUrls[0];
      const input = plateInputs.find((p) => p.locationId === outcome.ref);
      if (outcome.status !== "completed" || !url) {
        await query(
          `UPDATE locations SET plate_status = 'needs_human', plate_job_id = $3 WHERE build_id = $1 AND location_id = $2`,
          [buildId, outcome.ref, outcome.jobId],
        );
        continue;
      }
      const check = await locationPlateCheck(url, input?.anchors ?? []);
      await query(
        `UPDATE locations
            SET plate_job_id = $3, plate_url = $4, plate_status = $5,
                property_plate_job_id = $6
          WHERE build_id = $1 AND location_id = $2`,
        [
          buildId, outcome.ref, outcome.jobId, url,
          check.pass ? "locked" : "plate_failed",
          input?.property?.plateMediaId ?? null,
        ],
      );
    }

    await query(
      `INSERT INTO artifacts (build_id, process_id, kind, payload) VALUES ($1, $2, 'locations', $3::jsonb)`,
      [buildId, processId, JSON.stringify(locations)],
    );

    await finish(processId, usage);
    await handOff(buildId, 5, "ACT MAP AND WARDROBE MAP", QUEUE_MAPS);
  } catch (error) {
    await fail(processId, error);
    throw error;
  } finally {
    await client?.close();
  }
}

async function persistLocations(buildId: number, output: LocationOutput): Promise<void> {
  await transaction(async (db) => {
    await db.query(`DELETE FROM locations WHERE build_id = $1`, [buildId]);
    await db.query(`DELETE FROM properties WHERE build_id = $1`, [buildId]);

    for (const property of output.properties) {
      await db.query(
        `INSERT INTO properties (build_id, dwelling_id, fields) VALUES ($1, $2, $3::jsonb)`,
        [buildId, property.dwellingId, JSON.stringify(property)],
      );
    }

    for (const location of output.locations) {
      await db.query(
        `INSERT INTO locations
           (build_id, location_id, name, tier, channel, beat_count, ownership, dwelling_id,
            sheet, anchors, geo_line, landmark, plate_prompt, plate_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14)`,
        [
          buildId, location.locationId, location.name, location.tier, location.channel,
          location.beatCount, location.ownership, location.dwellingId,
          JSON.stringify(location.sheet), JSON.stringify(location.anchors),
          location.geoLine, location.landmark, location.roomDescription,
          // §30C 1a: a plate is a consistency device, and a room with nothing
          // to be consistent against does not earn one.
          location.tier === "PLATED" ? "pending" : "not_required",
        ],
      );
    }
  });
}

/* ------------------------------------------------------------------ *
 * Step 5 — act map and wardrobe map
 * ------------------------------------------------------------------ */

export async function runMaps(processId: number): Promise<void> {
  const proc = await claim(processId);
  if (!proc) return;

  try {
    const buildId = proc.build_id;
    const context = await buildContext(buildId);

    const cast = await query<{
      character_id: string; name: string; is_narrator: boolean;
      wardrobe_classes: unknown; signature_item: string | null;
    }>(`SELECT character_id, name, is_narrator, wardrobe_classes, signature_item
          FROM characters WHERE build_id = $1 ORDER BY id`, [buildId]);

    const locations = await query<{
      location_id: string; name: string; tier: string; beat_count: number; ownership: string;
    }>(`SELECT location_id, name, tier, beat_count, ownership FROM locations WHERE build_id = $1 ORDER BY id`,
      [buildId]);

    const claims = await query<{ text: string; tier: number; phrase_ref: string | null }>(
      `SELECT text, tier, phrase_ref FROM claims WHERE build_id = $1 ORDER BY tier, id`, [buildId],
    );

    const declared = context.declared as { generic_class_pool?: unknown };

    const { maps, usage } = await deriveMaps({
      phraseInventory: context.phraseInventory,
      claims: claims.map((c) => ({ text: c.text, tier: c.tier, phraseRef: c.phrase_ref })),
      cast: cast.map((c) => ({
        characterId: c.character_id, name: c.name, isNarrator: c.is_narrator,
        wardrobeClasses: c.wardrobe_classes, signatureItem: c.signature_item,
      })),
      genericClassPool: declared.generic_class_pool ?? {},
      locations: locations.map((l) => ({
        locationId: l.location_id, name: l.name, tier: l.tier,
        beatCount: l.beat_count, ownership: l.ownership,
      })),
      declared: context.declared,
      absorptionSummary: context.absorptionSummary,
      onStage: (s) => void setStage(processId, s),
    });

    // The audits are recounted here rather than trusted. §14A and §27B both
    // require the check to travel with the deliverable.
    const audits = auditMaps(maps, context.phraseInventory.map((p) => p.phraseId));

    await persistMaps(buildId, proc.id, maps, audits);
    await finish(processId, usage);
  } catch (error) {
    await fail(processId, error);
    throw error;
  }
}

async function persistMaps(
  buildId: number,
  processId: number,
  maps: MapsOutput,
  audits: ReturnType<typeof auditMaps>,
): Promise<void> {
  await transaction(async (db) => {
    await db.query(`DELETE FROM act_map_rows WHERE build_id = $1`, [buildId]);
    await db.query(`DELETE FROM capture_events WHERE build_id = $1`, [buildId]);
    await db.query(`DELETE FROM story_days WHERE build_id = $1`, [buildId]);

    for (const day of maps.storyDays) {
      await db.query(
        `INSERT INTO story_days (build_id, day, act, channel, subject, outfit, colour_family)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (build_id, day, subject) DO NOTHING`,
        [buildId, day.day, day.act, day.channel, day.subject, JSON.stringify(day.outfit), day.colourFamily],
      );
    }

    for (const event of maps.captureEvents) {
      await db.query(
        `INSERT INTO capture_events (build_id, event_id, story_day, location_id, visibility, alibi, beats)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT (build_id, event_id) DO NOTHING`,
        [buildId, event.eventId, event.storyDay, event.locationId, event.visibility, event.alibi, JSON.stringify(event.beats)],
      );
    }

    for (const row of maps.actMap) {
      await db.query(
        `INSERT INTO act_map_rows
           (build_id, beat_id, ordinal, act, phrase_ids, type, register, rig, frame_side, framing_step,
            energy, valence, ownership, function, subject, alibi, location_id, story_day,
            capture_event_id, sequence_id, geo_line_ref, wardrobe_ref, duration, product_state,
            visibility, claims, plant_payoff, notes)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28)
         ON CONFLICT (build_id, beat_id) DO NOTHING`,
        [
          buildId, row.beatId, row.ordinal, row.act, JSON.stringify(row.phraseIds), row.type,
          row.register, row.rig, row.frameSide, row.framingStep, row.energy, row.valence,
          row.ownership, row.function, row.subject, row.alibi, row.locationId, row.storyDay,
          row.captureEventId, row.sequenceId, row.geoLineRef, row.wardrobeRef, row.duration,
          row.productState, row.visibility, JSON.stringify(row.claims), row.plantPayoff, row.notes,
        ],
      );
    }

    // §27B's dispositions land on the phrase rows the inventory already holds.
    for (const disposition of maps.dispositions) {
      await db.query(
        `UPDATE phrases SET disposition = $3, demo = $4, blocked_reason = $5
          WHERE build_id = $1 AND phrase_id = $2`,
        [buildId, disposition.phraseId, disposition.disposition, disposition.demo, disposition.blockedReason],
      );
    }

    await db.query(
      `INSERT INTO artifacts (build_id, process_id, kind, payload) VALUES ($1, $2, 'maps', $3::jsonb)`,
      [buildId, processId, JSON.stringify({ ...maps, independentAudits: audits })],
    );
  });
}

export { QUEUE_ABSORB_SCRIPT, QUEUE_CAST };
