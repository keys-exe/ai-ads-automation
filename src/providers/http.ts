/**
 * Shared HTTP for the provider adapters.
 *
 * Deliberately thin. Each provider's own quirks stay in its own file so that
 * verifying one against live docs touches one place.
 */

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number | null,
    message: string,
    public readonly body?: string,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  /** Providers differ: some return JSON, some return raw audio/video bytes. */
  expect?: "json" | "binary";
  timeoutMs?: number;
}

export async function request<T = unknown>(
  provider: string,
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", headers = {}, body = null, expect = "json", timeoutMs = 120_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (error) {
    // An aborted request and a refused connection read very differently to an
    // operator, so they are not collapsed into one message.
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(provider, null, `request timed out after ${timeoutMs}ms`);
    }
    throw new ProviderError(provider, null, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ProviderError(provider, response.status, `HTTP ${response.status}`, text.slice(0, 1000));
  }

  if (expect === "binary") return (await response.arrayBuffer()) as T;

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(provider, response.status, "response was not JSON", text.slice(0, 500));
  }
}

/** Poll until `done` returns a value, or the deadline passes. */
export async function pollUntil<T>(
  provider: string,
  check: () => Promise<T | null>,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const { timeoutMs = 15 * 60 * 1000, intervalMs = 5000, label = "job" } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await check();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new ProviderError(provider, null, `${label} did not finish within ${Math.round(timeoutMs / 1000)}s`);
}
