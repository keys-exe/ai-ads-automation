/**
 * `run_ledger.json` — Appendix E3.
 *
 * E3 is explicit about what this file is for: "the source for §34 global scans,
 * reissue passes, resume-after-interruption, and the Open Decisions counts —
 * **computed, never hand-maintained**."
 *
 * So nothing here is written by a person and nothing is written twice. Every
 * mutation goes through `updateLedger`, which reads, applies and writes
 * atomically, so an interrupted build resumes from the last completed write
 * rather than from a truncated file.
 */

import { paths } from "./paths";
import { readJson, writeJson } from "./json";

/** E2's failure taxonomy, exactly. */
export const FAILURE_CLASSES = [
  "SAFETY_REJECT",
  "PRESET_OVERRIDE",
  "COMPLETION_404",
  "QUALITY_FAIL",
  "CONSISTENCY_FAIL",
  "SYNC_DRIFT",
  "ALIAS_MISMATCH",
] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

/**
 * E2's global rule: "two automatic rerolls per beat per failure class, then the
 * beat queues for a human with its failure history attached."
 */
export const REROLL_BUDGET = 2;

export interface RetryRecord {
  class: FailureClass;
  action: string;
  ts: string;
}

export interface Attachment {
  role: string;
  /** E3's `media_or_job_id`. A prior job id is accepted in `medias[].value`. */
  mediaOrJobId: string;
}

/** A QA result per E1 check name. `null` where the check has not run. */
export type QaResult = Record<string, boolean | null>;

/** One row per beat, per E3. */
export interface BeatRow {
  beatId: string;
  phraseIds: string[];
  t2iPromptPath: string | null;
  t2iJobId: string | null;
  t2iStatus: string | null;
  t2iQa: QaResult;
  i2vPromptPath: string | null;
  i2vJobId: string | null;
  i2vStatus: string | null;
  i2vQa: QaResult;
  retries: RetryRecord[];
  attachments: Attachment[];
  delivered: boolean;
  /** `{ section, reason }` where §34 has invalidated this beat. */
  reissueFlag: { section: string; reason: string } | null;
}

export interface PropertyEntry {
  sheetPath: string | null;
  plateJobId: string | null;
  plateCheck: unknown;
}

export interface CaptureEventEntry {
  storyDay: string;
  locationId: string;
  beats: string[];
}

export interface ModelLockEntry {
  model: string;
  variant?: string | null;
  quality?: string | null;
  resolution?: string | null;
}

/** E3's build-level `declared{}`, written at §18 step 2. */
export interface Declared {
  side?: string | null;
  mechanismClaim?: string | null;
  format?: string | null;
  mode?: string | null;
  hybridByAct?: unknown;
  modelLock?: Record<string, ModelLockEntry>;
  locks?: Record<string, string>;
  placement?: unknown;
  genericClassPool?: unknown;
  /**
   * Deviations from the Standards taken on the operator's instruction. §45
   * requires an override against the document to be recorded rather than
   * applied quietly, and this is where it travels with the build.
   */
  overrides?: Array<{ section: string; decision: string; reason: string }>;
}

export interface RunLedger {
  beats: Record<string, BeatRow>;
  property: Record<string, PropertyEntry>;
  /** E3: every location row carries a job id or an explicit null. */
  plates: Record<string, string | null>;
  subjects: Record<string, string | null>;
  storyDays: Record<string, unknown>;
  captureEvents: Record<string, CaptureEventEntry>;
  declared: Declared;
  versionBuiltAgainst: string;
  /** Not E3: step progress, so `--from` and `/status` read one file. */
  steps: Record<string, StepState>;
  updatedAt: string;
}

export interface StepState {
  step: number;
  kind: string;
  label: string;
  status: "queued" | "running" | "done" | "failed" | "blocked";
  stage: string;
  error: string | null;
  usage: unknown;
  startedAt: string | null;
  finishedAt: string | null;
}

export function emptyLedger(version: string): RunLedger {
  return {
    beats: {},
    property: {},
    plates: {},
    subjects: {},
    storyDays: {},
    captureEvents: {},
    declared: {},
    versionBuiltAgainst: version,
    steps: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function readLedger(slug: string): Promise<RunLedger | undefined> {
  return readJson<RunLedger>(paths(slug).ledger);
}

/**
 * The only writer.
 *
 * Serialised per slug: two steps of one build can be in flight inside the same
 * process (step 4 writing plate outcomes while step 3's last check lands), and
 * an interleaved read-modify-write would drop one of them. The chain is awaited
 * rather than concurrent today, so this queue is usually empty — it is here so
 * that stays true if a later step fans out.
 */
const writeQueues = new Map<string, Promise<unknown>>();

export async function updateLedger(
  slug: string,
  apply: (ledger: RunLedger) => void | Promise<void>,
): Promise<RunLedger> {
  const previous = writeQueues.get(slug) ?? Promise.resolve();

  const next = previous.then(async () => {
    const path = paths(slug).ledger;
    const ledger = (await readJson<RunLedger>(path)) ?? emptyLedger("unknown");
    await apply(ledger);
    ledger.updatedAt = new Date().toISOString();
    await writeJson(path, ledger);
    return ledger;
  });

  // Keep the chain going past a rejection so one failed write does not wedge
  // every later write for this build.
  writeQueues.set(slug, next.catch(() => undefined));
  return next;
}

export function blankBeatRow(beatId: string, phraseIds: string[] = []): BeatRow {
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

/**
 * E2: has this beat spent its two automatic rerolls for this failure class?
 *
 * The budget is per beat *per class* — a beat that has hit QUALITY_FAIL twice
 * may still reroll once on a fresh CONSISTENCY_FAIL — and an unlabelled reroll
 * is how a beat quietly consumes four (§16B).
 */
export function rerollsSpent(row: BeatRow, failureClass: FailureClass): number {
  return row.retries.filter((retry) => retry.class === failureClass).length;
}

export function budgetExhausted(row: BeatRow, failureClass: FailureClass): boolean {
  return rerollsSpent(row, failureClass) >= REROLL_BUDGET;
}
