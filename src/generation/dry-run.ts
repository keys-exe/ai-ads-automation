/**
 * A generation client that submits nothing.
 *
 * `--no-generate` exists to rehearse a build's shape without spending image
 * credits: the §16B manifests are still written, every call is still assembled
 * and printed with its model and params, and nothing reaches the platform.
 *
 * It reports each job as `dry_run` with no result URL rather than faking a
 * completion. That matters: a fake completion would send a made-up URL into
 * §19's panel check and §30G's plate check, which are model calls against the
 * image, so the rehearsal would both spend money and score a picture that does
 * not exist. `dry_run` instead lands on the same branch a genuine failure takes
 * — the artefact is marked `needs_human` and the chain carries on — which also
 * exercises §30G's hold path for rooms whose dwelling plate never arrived.
 */

import type { GenerationClient, JobStatus, SubmittedJob } from "./client";
import type { ImageCallParams } from "./arsenal";

export interface DryRunCall {
  index: number;
  params: ImageCallParams;
}

export class DryRunGenerationClient implements GenerationClient {
  readonly calls: DryRunCall[] = [];
  readonly imports: string[] = [];

  constructor(private readonly onCall?: (call: DryRunCall) => void) {}

  async importMedia(url: string): Promise<string> {
    this.imports.push(url);
    return `dry-run-media-${this.imports.length}`;
  }

  async submitImages(
    requests: Array<{ index: number; params: ImageCallParams }>,
  ): Promise<SubmittedJob[]> {
    return requests.map((request) => {
      const call: DryRunCall = { index: request.index, params: request.params };
      this.calls.push(call);
      this.onCall?.(call);
      return { index: request.index, jobId: `dry-run-${request.index}` };
    });
  }

  async waitForJobs(jobs: SubmittedJob[]): Promise<{ statuses: JobStatus[]; allTerminal: boolean }> {
    const statuses: JobStatus[] = jobs.map((job) => ({
      index: job.index,
      jobId: job.jobId,
      status: "dry_run",
      terminal: true,
      resultUrls: [],
      loggedModel: null,
      error: "--no-generate: nothing was submitted.",
    }));
    return { statuses, allTerminal: true };
  }

  async close(): Promise<void> {}
}
