/**
 * Batch submission with E2's retry budgets.
 *
 * "Global rule: two automatic rerolls per beat per failure class, then the
 * beat queues for a human with its failure history attached. Retries never
 * change the prompt silently — every changed prompt is a delivered iteration."
 *
 * So a reroll here resubmits the *same* prompt. A prompt that needs changing
 * (the §22S escalation ladder, a `PLACE-LOCK` restated in full form) is a new
 * call made by the caller, recorded as an iteration, not a silent retry.
 */

import {
  isFailed,
  MAX_BATCH,
  MAX_WAIT_GROUP,
  type GenerationClient,
  type JobStatus,
  type SubmittedJob,
} from "./client";
import { verifyLoggedModel, RetiredModelError, AliasMismatchError, type ImageCallParams } from "./arsenal";

/** E2's failure taxonomy. */
export type FailureClass =
  | "SAFETY_REJECT"
  | "PRESET_OVERRIDE"
  | "COMPLETION_404"
  | "QUALITY_FAIL"
  | "CONSISTENCY_FAIL"
  | "ALIAS_MISMATCH"
  | "SUBMIT_FAIL";

export const RETRY_BUDGET: Record<FailureClass, number> = {
  SAFETY_REJECT: 2,
  PRESET_OVERRIDE: 3,
  COMPLETION_404: 2,
  QUALITY_FAIL: 2,
  CONSISTENCY_FAIL: 2,
  ALIAS_MISMATCH: 1,
  SUBMIT_FAIL: 2,
};

export interface GenerationRequest {
  /** Stable index. §16B: item n of the payload must be item n of the manifest. */
  index: number;
  /** What this generation is for — a character id, a location id, the property. */
  ref: string;
  /** The script line or label stated above the call (§16B). */
  label: string;
  params: ImageCallParams;
}

export interface GenerationOutcome {
  index: number;
  ref: string;
  label: string;
  jobId: string | null;
  status: "completed" | "failed" | "needs_human";
  resultUrls: string[];
  loggedModel: string | null;
  attempts: number;
  failures: Array<{ class: FailureClass; detail: string; attempt: number }>;
}

export interface RunBatchOptions {
  client: GenerationClient;
  requests: GenerationRequest[];
  /** Overall ceiling on the poll loop, per E2's COMPLETION_404 10-minute timeout. */
  timeoutMs?: number;
  onProgress?: (done: number, total: number) => void;
  /** Called before each batch so the manifest can be written to the ledger (§16B). */
  onManifest?: (manifest: GenerationRequest[]) => void | Promise<void>;
}

/**
 * Submit every request, poll to terminal, verify the logged model, and retry
 * inside budget. Returns one outcome per request, in request order.
 */
export async function runImageBatch(options: RunBatchOptions): Promise<GenerationOutcome[]> {
  const { client, requests, timeoutMs = 10 * 60 * 1000, onProgress, onManifest } = options;

  const outcomes = new Map<number, GenerationOutcome>(
    requests.map((r) => [r.index, {
      index: r.index, ref: r.ref, label: r.label, jobId: null,
      status: "failed" as const, resultUrls: [], loggedModel: null,
      attempts: 0, failures: [],
    }]),
  );

  let pending = [...requests];
  let round = 0;

  while (pending.length) {
    round += 1;
    const submitted: Array<{ request: GenerationRequest; job: SubmittedJob }> = [];

    // --- Submit, chunked to the tool's 12-request ceiling.
    for (const chunk of chunked(pending, MAX_BATCH)) {
      await onManifest?.(chunk);
      try {
        const jobs = await client.submitImages(chunk.map((r) => ({ index: r.index, params: r.params })));
        for (const job of jobs) {
          const request = chunk.find((r) => r.index === job.index);
          if (request) submitted.push({ request, job });
        }
        // A request the platform accepted without returning a job is not a
        // silent success — record it so it can be retried or escalated.
        for (const request of chunk) {
          if (!jobs.some((j) => j.index === request.index)) {
            record(outcomes, request, "SUBMIT_FAIL", "No job id returned for this item", round);
          }
        }
      } catch (error) {
        for (const request of chunk) {
          record(outcomes, request, "SUBMIT_FAIL", messageOf(error), round);
        }
      }
    }

    // --- Poll to terminal. jobs_wait long-polls for at most 15s, so this is a
    //     loop rather than a single call.
    const statuses = await pollToTerminal(client, submitted.map((s) => s.job), timeoutMs, (done) =>
      onProgress?.(done, submitted.length),
    );

    for (const { request, job } of submitted) {
      const status = statuses.get(job.jobId);
      const outcome = outcomes.get(request.index)!;
      outcome.jobId = job.jobId;
      outcome.attempts = round;

      if (!status) {
        record(outcomes, request, "COMPLETION_404", "Job never reached a terminal state inside the timeout", round);
        continue;
      }

      if (isFailed(status.status)) {
        record(outcomes, request, classifyFailure(status), status.error ?? status.status, round);
        continue;
      }

      // §44.47 — the string passed is not evidence of the model run.
      try {
        verifyLoggedModel(request.params.model, status.loggedModel);
      } catch (error) {
        const failureClass: FailureClass =
          error instanceof RetiredModelError || error instanceof AliasMismatchError
            ? "ALIAS_MISMATCH"
            : "QUALITY_FAIL";
        record(outcomes, request, failureClass, messageOf(error), round);
        continue;
      }

      outcome.status = "completed";
      outcome.resultUrls = status.resultUrls;
      outcome.loggedModel = status.loggedModel;
    }

    // --- Retry only what is still inside budget for its own failure class.
    pending = pending.filter((request) => {
      const outcome = outcomes.get(request.index)!;
      if (outcome.status === "completed") return false;

      const last = outcome.failures[outcome.failures.length - 1];
      if (!last) return false;

      const used = outcome.failures.filter((f) => f.class === last.class).length;
      if (used >= RETRY_BUDGET[last.class]) {
        // "then the beat queues for a human with its failure history attached"
        outcome.status = "needs_human";
        return false;
      }
      return true;
    });
  }

  return requests.map((r) => outcomes.get(r.index)!);
}

async function pollToTerminal(
  client: GenerationClient,
  jobs: SubmittedJob[],
  timeoutMs: number,
  onProgress?: (done: number) => void,
): Promise<Map<string, JobStatus>> {
  const final = new Map<string, JobStatus>();
  const deadline = Date.now() + timeoutMs;
  let outstanding = [...jobs];

  while (outstanding.length && Date.now() < deadline) {
    const next: SubmittedJob[] = [];

    for (const group of chunked(outstanding, MAX_WAIT_GROUP)) {
      const { statuses } = await client.waitForJobs(group);
      for (const status of statuses) {
        if (status.terminal) final.set(status.jobId, status);
        else {
          const job = group.find((g) => g.jobId === status.jobId);
          if (job) next.push(job);
        }
      }
      // A job the wait did not report on at all stays outstanding rather than
      // being dropped as done.
      for (const job of group) {
        if (!statuses.some((s) => s.jobId === job.jobId) && !final.has(job.jobId)) next.push(job);
      }
    }

    outstanding = next;
    onProgress?.(final.size);

    // jobs_wait already long-polls; a short pause avoids hammering it when
    // every job comes back non-terminal immediately.
    if (outstanding.length) await sleep(2000);
  }

  return final;
}

function classifyFailure(status: JobStatus): FailureClass {
  const text = `${status.error ?? ""} ${status.status}`.toLowerCase();
  // §5: safety classifiers score the raw prompt and do not parse negation, so
  // a refusal is its own class with its own remedy (the §5 vocabulary swaps).
  if (/safety|moderat|policy|refus|blocked|nsfw/.test(text)) return "SAFETY_REJECT";
  if (/preset/.test(text)) return "PRESET_OVERRIDE";
  if (/not found|404|missing media/.test(text)) return "COMPLETION_404";
  return "QUALITY_FAIL";
}

function record(
  outcomes: Map<number, GenerationOutcome>,
  request: GenerationRequest,
  failureClass: FailureClass,
  detail: string,
  attempt: number,
): void {
  const outcome = outcomes.get(request.index)!;
  outcome.failures.push({ class: failureClass, detail: detail.slice(0, 500), attempt });
  outcome.attempts = attempt;
}

export function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
