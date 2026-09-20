/**
 * The generation transport.
 *
 * E7 records the call templates in MCP tool terms — `generate_image_batch`,
 * `jobs_wait`, `show_generation_by_ids` — so the worker speaks MCP rather than
 * reimplementing the platform's REST surface.
 *
 * Three constraints live in the real tool schemas and NOT in E7's templates.
 * Each one breaks a naive implementation:
 *
 *   1. `generate_image_batch` takes at most 12 requests. A build with twenty
 *      locations is several batches, and the indices must stay stable across
 *      them or the manifest stops matching the payload (§16B).
 *   2. `jobs_wait` takes at most 12 jobs and long-polls for at most 15
 *      seconds. E7's "jobs_wait on every T2I before its I2V" is therefore a
 *      poll loop, not one call.
 *   3. `medias[].value` must be a media UUID or a prior job_id — an https URL
 *      is rejected. Uploaded references are imported via `media_import_url`
 *      first, and the returned id is what goes in the call.
 *
 * A fourth is a silent no-op rather than an error: omitting `use_unlim` makes
 * the server return an `unlim_choice` question and submit nothing. Arsenal
 * always sets it explicitly.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ImageCallParams } from "./arsenal";

/** Hard limits from the tool schemas, not from E7. */
export const MAX_BATCH = 12;
export const MAX_WAIT_GROUP = 12;
export const MAX_WAIT_SECONDS = 15;

export interface SubmittedJob {
  index: number;
  jobId: string;
}

export interface JobStatus {
  index: number;
  jobId: string;
  status: string;
  terminal: boolean;
  resultUrls: string[];
  /** The model the platform actually ran, for the §44.47 check. */
  loggedModel: string | null;
  error: string | null;
}

export interface GenerationClient {
  importMedia(url: string): Promise<string>;
  submitImages(requests: Array<{ index: number; params: ImageCallParams }>): Promise<SubmittedJob[]>;
  waitForJobs(jobs: SubmittedJob[], timeoutSeconds?: number): Promise<{ statuses: JobStatus[]; allTerminal: boolean }>;
  close(): Promise<void>;
}

export class McpGenerationClient implements GenerationClient {
  private client: Client | null = null;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: "ai-ads-build-pipeline", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: { headers: this.headers },
    });
    await client.connect(transport);
    this.client = client;
    return client;
  }

  private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    const result = await client.callTool({ name, arguments: args });

    if (result.isError) {
      throw new GenerationError(`${name} failed: ${stringifyContent(result.content)}`);
    }
    // Prefer the tool's structured result; fall back to parsing the text block,
    // since not every server populates structuredContent.
    if (result.structuredContent) return result.structuredContent;
    return parseContent(result.content);
  }

  async importMedia(url: string): Promise<string> {
    const result = (await this.call("media_import_url", { url, type: "image" })) as Record<string, unknown>;
    const id = findFirstString(result, ["media_id", "id", "mediaId"]);
    if (!id) throw new GenerationError(`media_import_url returned no media id for ${url}`);
    return id;
  }

  async submitImages(
    requests: Array<{ index: number; params: ImageCallParams }>,
  ): Promise<SubmittedJob[]> {
    if (requests.length > MAX_BATCH) {
      throw new GenerationError(
        `generate_image_batch accepts at most ${MAX_BATCH} requests; got ${requests.length}. Chunk before calling.`,
      );
    }

    const result = (await this.call("generate_image_batch", { requests })) as Record<string, unknown>;
    const jobs = extractArray(result, ["jobs", "results", "items"]);

    return jobs.map((job) => {
      const record = job as Record<string, unknown>;
      const jobId = findFirstString(record, ["job_id", "jobId", "id"]);
      if (!jobId) {
        throw new GenerationError(`Batch item returned no job id: ${JSON.stringify(record).slice(0, 200)}`);
      }
      return { index: Number(record.index ?? 0), jobId };
    });
  }

  async waitForJobs(
    jobs: SubmittedJob[],
    timeoutSeconds = MAX_WAIT_SECONDS,
  ): Promise<{ statuses: JobStatus[]; allTerminal: boolean }> {
    if (jobs.length > MAX_WAIT_GROUP) {
      throw new GenerationError(
        `jobs_wait accepts at most ${MAX_WAIT_GROUP} jobs; got ${jobs.length}. Chunk before calling.`,
      );
    }

    const result = (await this.call("jobs_wait", {
      jobs: jobs.map((j) => ({ index: j.index, job_id: j.jobId })),
      timeout_seconds: Math.min(timeoutSeconds, MAX_WAIT_SECONDS),
    })) as Record<string, unknown>;

    const rows = extractArray(result, ["jobs", "statuses", "results", "items"]);
    const statuses: JobStatus[] = rows.map((row) => {
      const record = row as Record<string, unknown>;
      const status = String(findFirstString(record, ["status", "state"]) ?? "unknown");
      return {
        index: Number(record.index ?? 0),
        jobId: String(findFirstString(record, ["job_id", "jobId", "id"]) ?? ""),
        status,
        terminal: isTerminal(status),
        resultUrls: extractUrls(record),
        loggedModel: findFirstString(record, ["model", "logged_model", "model_id"]),
        error: findFirstString(record, ["error", "error_message", "failure_reason"]),
      };
    });

    const allTerminal =
      typeof result.all_terminal === "boolean"
        ? result.all_terminal
        : statuses.length > 0 && statuses.every((s) => s.terminal);

    return { statuses, allTerminal };
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }
}

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

const TERMINAL_STATES = new Set(["completed", "succeeded", "success", "done", "failed", "error", "cancelled", "canceled"]);
const FAILED_STATES = new Set(["failed", "error", "cancelled", "canceled"]);

export function isTerminal(status: string): boolean {
  return TERMINAL_STATES.has(status.toLowerCase());
}

export function isFailed(status: string): boolean {
  return FAILED_STATES.has(status.toLowerCase());
}

/* --- Response shape helpers -------------------------------------------- *
 * The tool descriptions fix the request shapes but not the response key
 * names, so these read defensively across the plausible spellings rather
 * than hard-coding one and failing opaquely on a rename.
 * ---------------------------------------------------------------------- */

function stringifyContent(content: unknown): string {
  if (!Array.isArray(content)) return String(content);
  return content
    .map((block) => (block && typeof block === "object" && "text" in block ? String((block as { text: unknown }).text) : ""))
    .join(" ")
    .slice(0, 500);
}

function parseContent(content: unknown): unknown {
  const text = stringifyContent(content);
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function findFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function extractArray(result: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(result[key])) return result[key] as unknown[];
  }
  if (Array.isArray(result)) return result;
  throw new GenerationError(
    `Expected an array under one of ${keys.join("/")}; got keys ${Object.keys(result).join(", ")}`,
  );
}

function extractUrls(record: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["url", "result_url", "output_url", "image_url"]) {
    const value = record[key];
    if (typeof value === "string" && value) out.push(value);
  }
  for (const key of ["urls", "result_urls", "outputs", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") out.push(item);
        else if (item && typeof item === "object") {
          const nested = findFirstString(item as Record<string, unknown>, ["url", "result_url", "output_url"]);
          if (nested) out.push(nested);
        }
      }
    }
  }
  return [...new Set(out)];
}

/**
 * Build a client from the configured connection.
 *
 * Reads Settings first and falls back to the environment, so a deployment can
 * run on env vars alone while a team can connect a credential through the UI
 * without a redeploy.
 */
/**
 * A seam for substituting the transport.
 *
 * `--dry-run` needs a client that records calls and submits nothing, and the
 * alternative — threading a flag through every step down to each call site —
 * would put a branch in the production path for the sake of a rehearsal. This
 * keeps the rehearsal entirely outside the steps.
 */
type ClientFactory = (provider: "higgsfield" | "kling") => Promise<GenerationClient>;

let factoryOverride: ClientFactory | null = null;

export function setGenerationClientFactory(factory: ClientFactory | null): void {
  factoryOverride = factory;
}

export async function generationClient(provider: "higgsfield" | "kling" = "higgsfield"): Promise<GenerationClient> {
  if (factoryOverride) return factoryOverride(provider);

  const { requireConnection } = await import("@/lib/connections");
  const connection = await requireConnection(provider);

  if (connection.kind === "cli") {
    throw new GenerationError(
      `The ${provider} connection is a CLI credentials file, which this worker cannot use directly. ` +
        `Set HIGGSFIELD_MCP_URL / HIGGSFIELD_MCP_TOKEN (or the KLING_ pair) instead.`,
    );
  }

  const url = connection.config.url;
  if (!url) {
    throw new GenerationError(
      `The ${provider} connection has no endpoint URL. Set ${provider === "higgsfield" ? "HIGGSFIELD_MCP_URL" : "KLING_MCP_URL"}.`,
    );
  }

  const token = "token" in connection.secret ? connection.secret.token
    : "apiKey" in connection.secret ? connection.secret.apiKey
    : "";

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return new McpGenerationClient(url, headers);
}
