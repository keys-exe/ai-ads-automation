/**
 * §18 step 4 — PROPERTY AND LOCATION MAPS.
 *
 * "The §30C Location Derivation Pass over the step-2 phrase inventory, opening
 * with channel C0 — which locations are rooms of one dwelling. Where two or
 * more are, the Property Sheet is written and its property plate generated and
 * checked first (§30G), before any location plate is built against it."
 *
 * That ordering is the whole step. §30G states the chain as a rule:
 *
 *   Property plate → attached to every location-plate generation
 *                  → each room's plate attached to that room's beats.
 *
 * So the property plate is an internal gate — automatic, but strict: a
 * location plate is never submitted until its dwelling's plate has passed.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { callWithStandards } from "@/lib/claude";
import { LocationOutput, type PropertySheet } from "./schemas-cast";
import { assembleLocationPlate, assemblePropertyPlate } from "@/generation/assemble";
import { buildImageCall, DEFAULT_ROUTES } from "@/generation/arsenal";
import { runImageBatch, type GenerationRequest, type GenerationOutcome } from "@/generation/runner";
import type { GenerationClient } from "@/generation/client";
import * as z from "zod/v4";

type PropertySheetType = z.infer<typeof PropertySheet>;

export const LOCATION_SECTIONS = [
  "30C",  // scene consistency, the derivation pass, the tiers, the Location Sheet
  "30G",  // the Property Standard — seven fields, the chain, the plate
  "22A",  // the lighting profile that becomes part six of the sheet
  "30B",  // ownership: STORY or GENERIC
  "15A",  // object beat surfaces, which decide what a room needs
  "12",   // the global grade — daylight default, no vignette
  "30D",  // after-states need a real flight of stairs with a top landing
  "30F",  // valence — a positive act needs a room with a bright end
  "44",
  "45",
];

const TASK = `You are executing §18 step 4: the property and location maps.

Run §30C's eight-channel Location Derivation Pass over the step-2 phrase inventory — NOT over the prose. C1 (the script names the room) is the only channel a plain read catches and it is usually the minority; on a build with a failed-solutions run and a proof act, most of the set arrives through C3 and C4.

RUN C0 FIRST. Which of the build's locations are rooms of one dwelling, which are its exterior and garden, and which stand alone? A derivation pass that does not run C0 first produces one Location Sheet per room and no house. Where two or more locations are rooms of one dwelling, write a Property Sheet with all seven fields.

Then tier every location (§30C 1a):
- PLATED — two or more beats where consecutive beats show the subject in the SAME SPOT from different angles. Full five-part Location Sheet, three to five named anchors, a plate.
- INCIDENTAL — one beat. No sheet, no plate, no anchors.
- TRAVERSED — any beat count, where the subject MOVES THROUGH rather than staying. A GEO-LINE and one named landmark carried across the beats. NO PLATE: a plate locks a room, and these beats exist to show nobody stayed in one. Attaching a plate here produces the "stuck in the plate" failure where every walking beat renders the subject standing in the plate's composition.

The test between PLATED and TRAVERSED is not indoors versus outdoors. A garden bench the narrator sits on across three acts is PLATED. A kitchen crossed once on the way to the back door is TRAVERSED.

Anchors are §8's asymmetry rule applied to rooms: never "a living room" but "the beige wingback with the tartan blanket over its back, the white radiator under the bright window, the books on the windowsill". Generic dressing is re-rolled per beat; named dressing holds.

Geometry goes on the sheet in ABSOLUTE ROOM TERMS. Do not resolve screen sides here — that is done per beat, by the writer, never left to the model.

Then run the four set-level checks S1-S4 and report each. S3 matters most: profiles are RECONCILED TO ORIENTATION, not merely varied. Two rooms on the same side of the house share a key direction and a time-of-day behaviour; two on opposite sides differ because they face differently. The §15 cut delta comes from palette, blow point, dressing and framing — never from giving two rooms of one house arbitrarily unalike light.

For PLATED locations, supply the plate's room description: geometry, fixed dressing and the named anchors. Do not write the plate prompt itself — the locked blocks are pasted verbatim by the pipeline and your prose goes into their slots. The plate is EMPTY: no people, no product, nothing staged.`;

export interface LocationInput {
  phraseInventory: Array<{ phraseId: string; text: string; structuralJob: string | null }>;
  declared: Record<string, unknown>;
  cast: Array<{ characterId: string; name: string; role: string; axes: Record<string, unknown> }>;
  onStage?: (stage: string) => void;
}

export async function deriveLocations(input: LocationInput): Promise<{ locations: LocationOutput; usage: unknown }> {
  const { phraseInventory, declared, cast, onStage = () => {} } = input;

  onStage("location-derivation");

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: [
        "## Step-2 phrase inventory",
        "",
        "The derivation pass runs over this, not over the script prose.",
        "",
        ...phraseInventory.map((p) => `${p.phraseId} [${p.structuralJob ?? "—"}] ${p.text}`),
        "",
        "## Cast locked at step 3",
        "",
        "Their class registers and environments (§19A axis 8) bear on which rooms exist and who owns them.",
        "",
        ...cast.map((c) => `${c.characterId} ${c.name} (${c.role}): ${JSON.stringify(c.axes)}`),
        "",
        "## Locks declared at step 2",
        "",
        JSON.stringify(declared, null, 2),
      ].join("\n"),
    },
  ];

  const result = await callWithStandards({
    sections: LOCATION_SECTIONS,
    schema: LocationOutput,
    task: TASK,
    content,
    maxTokens: 48000,
    effort: "high",
  });

  return { locations: result.output, usage: result.usage };
}

/**
 * §30G: "Generated at §18 step 4 with nothing attached, checked, and locked
 * before the first location plate is built against it."
 */
export async function generatePropertyPlates(
  properties: PropertySheetType[],
  client: GenerationClient,
  options: { onStage?: (s: string) => void; onManifest?: (m: GenerationRequest[]) => Promise<void> | void } = {},
): Promise<GenerationOutcome[]> {
  if (!properties.length) return [];
  const { onStage = () => {}, onManifest } = options;
  const model = DEFAULT_ROUTES.property_plate;

  const requests: GenerationRequest[] = properties.map((property, index) => ({
    index,
    ref: property.dwellingId,
    label: `${property.dwellingId} · §30G property plate — the shell, empty · ${model} high/2k · nothing attached`,
    params: buildImageCall({
      model,
      prompt: assemblePropertyPlate({
        typeAndEra: property.typeAndEra,
        wallFinishAndColour: property.shell.wallFinishAndColour,
        skirting: property.shell.skirting,
        architrave: property.shell.architrave,
        internalDoorAndHandle: property.shell.internalDoorAndHandle,
        ceiling: property.shell.ceiling,
        floorAndThreshold: property.shell.floorAndThreshold,
        radiator: property.shell.radiator,
        switchesAndSockets: property.shell.switchesAndSockets,
        lightingProfile: property.lightingProfile,
      }),
    }),
  }));

  onStage(`generating ${requests.length} property plate(s)`);
  return runImageBatch({ client, requests, onManifest, onProgress: (d, t) => onStage(`property plates ${d}/${t}`) });
}

export interface LocationPlateInput {
  locationId: string;
  name: string;
  roomDescription: string;
  lightingProfile: string;
  anchors: string[];
  /** Present only where the room belongs to the dwelling; carries the plate media id. */
  property: (PropertySheetType & { plateMediaId: string | null }) | null;
}

/**
 * §30C's plate, with the property plate attached where the room is part of the
 * dwelling. The attachment is the chain — without it each room is generated as
 * a generic room that happens to be next on the act map.
 */
export async function generateLocationPlates(
  locations: LocationPlateInput[],
  client: GenerationClient,
  options: { onStage?: (s: string) => void; onManifest?: (m: GenerationRequest[]) => Promise<void> | void } = {},
): Promise<GenerationOutcome[]> {
  if (!locations.length) return [];
  const { onStage = () => {}, onManifest } = options;
  const model = DEFAULT_ROUTES.location_plate;

  const requests: GenerationRequest[] = locations.map((location, index) => {
    const property = location.property;
    const prompt = assembleLocationPlate({
      roomDescription: location.roomDescription,
      lightingProfile: location.lightingProfile,
      property: property
        ? {
            typeAndEra: property.typeAndEra,
            wallFinishAndColour: property.shell.wallFinishAndColour,
            skirting: property.shell.skirting,
            architrave: property.shell.architrave,
            internalDoorAndHandle: property.shell.internalDoorAndHandle,
            ceiling: property.shell.ceiling,
            floorAndThreshold: property.shell.floorAndThreshold,
            radiator: property.shell.radiator,
            switchesAndSockets: property.shell.switchesAndSockets,
            lightingProfile: property.lightingProfile,
            carriedFinishes: property.carriedFinishes,
          }
        : null,
    });

    // The property plate goes in as a reference image. A dwelling room whose
    // plate is missing would be generated as a generic room, so it is an
    // error rather than a silent omission — caught by the caller.
    const medias = property?.plateMediaId
      ? [{ role: "reference", value: property.plateMediaId }]
      : [];

    return {
      index,
      ref: location.locationId,
      label: `${location.locationId} · ${location.name} — §30C scene plate, empty · ${model} high/2k · ${
        medias.length ? "property plate attached" : "no dwelling"
      }`,
      params: buildImageCall({ model, prompt, medias }),
    };
  });

  onStage(`generating ${requests.length} location plate(s)`);
  return runImageBatch({ client, requests, onManifest, onProgress: (d, t) => onStage(`location plates ${d}/${t}`) });
}
