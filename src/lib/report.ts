/**
 * The §16B call stream.
 *
 * §16B governs the tool-call stream itself, which is what an operator actually
 * reads while a build runs: "a column of model strings, prompt walls and job
 * ids with nothing in it that says which beat is which. At 74-92 B-roll beats
 * it is unnavigable — and a job id that cannot be traced back to a beat cannot
 * be scored against the first-frame check (§5), entered in the run ledger
 * (§E3), or reissued (§34)."
 *
 * So: no call fires without its label above it, no batch without its manifest
 * in submission order, and no job id is reported bare. The steps emit these
 * events; the CLI decides how to print them.
 */

export type ReportEvent =
  | { kind: "step-start"; step: number; label: string }
  | { kind: "stage"; step: number; stage: string }
  | { kind: "step-done"; step: number; usage: unknown }
  | { kind: "step-failed"; step: number; error: string }
  /** BEFORE — one line per item, in submission order, so item n is beat n. */
  | {
      kind: "manifest";
      purpose: string;
      items: Array<{ ref: string; label: string; model: string; params: Record<string, unknown> }>;
    }
  /** AFTER — every job id written back against its ref, in the same order. */
  | {
      kind: "outcomes";
      purpose: string;
      items: Array<{
        ref: string;
        jobId: string | null;
        status: string;
        loggedModel: string | null;
        attempts: number;
      }>;
    }
  | { kind: "note"; text: string };

type Sink = (event: ReportEvent) => void;

let sink: Sink | null = null;

export function setReporter(next: Sink | null): void {
  sink = next;
}

export function report(event: ReportEvent): void {
  sink?.(event);
}
