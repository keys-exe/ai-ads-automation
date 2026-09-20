/**
 * The row collections the §18 steps persist and read back.
 *
 * These replace the `phrases`, `claims`, `locks`, `generation_jobs`,
 * `characters`, `properties`, `locations`, `story_days`, `capture_events` and
 * `act_map_rows` tables. Rows keep the camelCase shape the step schemas already
 * emit rather than being mapped to snake_case columns and back — the mapping
 * was there to satisfy SQL, and without SQL it is only a place for a field to
 * get lost.
 */

import type { CastOutput, LocationOutput, MapsOutput } from "@/processes/schemas-cast";
import type { PhraseRow, ClaimRow } from "@/processes/schemas";
import type * as z from "zod/v4";
import { Collection } from "./json";
import { paths } from "./paths";
import { listBuilds } from "./build";

type Phrase = z.infer<typeof PhraseRow>;
type Claim = z.infer<typeof ClaimRow>;
type CastMember = CastOutput["cast"][number];
type DerivedLocation = LocationOutput["locations"][number];
type PropertySheet = LocationOutput["properties"][number];
type ActMapRow = MapsOutput["actMap"][number];
type StoryDayRow = MapsOutput["storyDays"][number];
type CaptureEventRow = MapsOutput["captureEvents"][number];

/* ------------------------------------------------------------------ *
 * Row shapes: the schema output plus the fields persistence adds
 * ------------------------------------------------------------------ */

export type PhraseRecord = Phrase & {
  disposition?: string | null;
  demo?: string | null;
  blockedReason?: string | null;
};

export type ClaimRecord = Claim & { resolvedAt?: string | null };

export interface LockRecord extends Record<string, unknown> {
  key: string;
  value: string;
  section: string;
  reason: string | null;
}

export type CharacterRecord = CastMember & {
  /** Which build cast this character. The roster spans builds (§19A). */
  slug: string;
  sheetJobId?: string | null;
  sheetUrl?: string | null;
  panelCheck?: unknown;
  /** pending · locked · panel_failed · needs_human */
  sheetStatus: string;
};

export type PropertyRecord = PropertySheet & {
  platePrompt?: string | null;
  plateJobId?: string | null;
  plateUrl?: string | null;
  plateCheck?: unknown;
  plateStatus: string;
};

export type LocationRecord = DerivedLocation & {
  plateJobId?: string | null;
  plateUrl?: string | null;
  plateStatus: string;
  propertyPlateJobId?: string | null;
};

/** §16B: the manifest row, written before the payload, completed after it. */
export interface GenerationJobRecord extends Record<string, unknown> {
  purpose: string;
  ref: string;
  label: string;
  batchIndex: number;
  model: string;
  params: Record<string, unknown>;
  prompt: string;
  jobId: string | null;
  status: string;
  loggedModel: string | null;
  resultUrls: string[];
  attempts: number;
  failures: unknown[];
  createdAt: string;
  finishedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Handles
 * ------------------------------------------------------------------ */

export const phrases = (slug: string) =>
  new Collection<PhraseRecord & Record<string, unknown>>(paths(slug).phraseInventory, "phraseId");

export const claims = (slug: string) =>
  new Collection<ClaimRecord & Record<string, unknown>>(paths(slug).collection("claims"), "text");

export const locks = (slug: string) =>
  new Collection<LockRecord>(paths(slug).collection("locks"), "key");

export const characters = (slug: string) =>
  new Collection<CharacterRecord & Record<string, unknown>>(
    paths(slug).registry("roster"),
    "characterId",
  );

export const properties = (slug: string) =>
  new Collection<PropertyRecord & Record<string, unknown>>(
    paths(slug).collection("properties"),
    "dwellingId",
  );

export const locations = (slug: string) =>
  new Collection<LocationRecord & Record<string, unknown>>(
    paths(slug).registry("scene"),
    "locationId",
  );

export const storyDays = (slug: string) =>
  new Collection<StoryDayRow & Record<string, unknown>>(
    paths(slug).collection("story_days"),
    "day",
  );

export const captureEvents = (slug: string) =>
  new Collection<CaptureEventRow & Record<string, unknown>>(
    paths(slug).collection("capture_events"),
    "eventId",
  );

export const actMap = (slug: string) =>
  new Collection<ActMapRow & Record<string, unknown>>(paths(slug).actMap, "beatId");

/**
 * Generation jobs are keyed by `purpose:ref` rather than by ref alone: one
 * build generates an avatar sheet and a location plate that can share a ref,
 * and §16B's whole point is that a job id resolves to exactly one thing.
 */
export const generationJobs = (slug: string) =>
  new Collection<GenerationJobRecord>(paths(slug).collection("generation_jobs"), "key");

export function generationKey(purpose: string, ref: string): string {
  return `${purpose}:${ref}`;
}

/* ------------------------------------------------------------------ *
 * The Roster Ledger — the one read that spans builds
 * ------------------------------------------------------------------ */

/**
 * §19A clears a new character against every locked avatar, not just this
 * build's, so this scans every build's roster rather than one file.
 *
 * Only `locked` sheets count. A sheet that failed its §19 panel check is not
 * an identity anything should be cleared against.
 */
export async function readRoster(): Promise<
  Array<{ characterId: string; name: string; axes: unknown; slug: string }>
> {
  const builds = await listBuilds();
  const roster: Array<{ characterId: string; name: string; axes: unknown; slug: string }> = [];

  for (const build of builds) {
    const rows = await characters(build.slug).all().catch(() => []);
    for (const row of rows) {
      if (row.sheetStatus !== "locked") continue;
      roster.push({
        characterId: row.characterId,
        name: row.name,
        axes: row.axes,
        slug: build.slug,
      });
    }
  }
  return roster;
}
