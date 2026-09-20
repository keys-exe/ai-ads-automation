/**
 * Connection tests.
 *
 * Each one makes a real, read-only call against the provider. A test that only
 * validated the shape of a key would pass on a revoked credential, which is
 * precisely the case somebody opens Settings to diagnose.
 *
 * Every test is chosen to cost nothing: a token count, a balance read, an
 * identity call. None of them generates.
 */

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { query } from "@/db/client";
import { MODEL } from "./claude";
import type { Provider, ResolvedConnection } from "./connections";

export interface TestResult {
  ok: boolean;
  detail: string;
}

export async function testConnection(connection: ResolvedConnection): Promise<TestResult> {
  try {
    switch (connection.provider) {
      case "anthropic":
        return await testAnthropic(connection);
      case "higgsfield":
      case "kling":
        return await testMcpOrApi(connection);
      default:
        return { ok: false, detail: `No test defined for ${connection.provider}.` };
    }
  } catch (error) {
    return { ok: false, detail: messageOf(error) };
  }
}

/**
 * Counts tokens on a one-word message. Exercises authentication and the model
 * id without generating anything, so it is free.
 */
async function testAnthropic(connection: ResolvedConnection): Promise<TestResult> {
  if (!("apiKey" in connection.secret)) return { ok: false, detail: "No API key stored." };

  const client = new Anthropic({ apiKey: connection.secret.apiKey });
  const result = await client.messages.countTokens({
    model: MODEL,
    messages: [{ role: "user", content: "ping" }],
  });

  return {
    ok: true,
    detail: `Authenticated. ${MODEL} reachable (token count returned ${result.input_tokens}).`,
  };
}

/**
 * Connects over MCP and calls a read-only tool. Which tool depends on the
 * provider: Higgsfield exposes `balance`, Kling `who_am_i`. Falls back to
 * listing tools where neither is present, which still proves the handshake.
 */
async function testMcpOrApi(connection: ResolvedConnection): Promise<TestResult> {
  if (connection.kind === "cli") {
    // A pasted credentials file cannot be exercised server-side without the
    // CLI's own refresh logic, so this validates shape and reports honestly
    // rather than implying a live check happened.
    if (!("credentialsJson" in connection.secret)) return { ok: false, detail: "No credentials stored." };
    try {
      const parsed = JSON.parse(connection.secret.credentialsJson) as Record<string, unknown>;
      const keys = Object.keys(parsed);
      if (!keys.length) return { ok: false, detail: "Credentials file parsed but is empty." };
      return {
        ok: true,
        detail: `Stored. Valid JSON with ${keys.length} field(s) — not verified against the service, since a CLI credentials file cannot be exercised from here.`,
      };
    } catch {
      return { ok: false, detail: "Not valid JSON. Paste the whole credentials file, unmodified." };
    }
  }

  const url = connection.config.url;
  if (!url) return { ok: false, detail: "No endpoint URL configured." };

  const token = "token" in connection.secret ? connection.secret.token
    : "apiKey" in connection.secret ? connection.secret.apiKey
    : "";

  const client = new Client({ name: "ai-ads-build-pipeline", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const names = new Set(tools.tools.map((t) => t.name));
    const probe = connection.provider === "higgsfield"
      ? (names.has("balance") ? "balance" : null)
      : (names.has("who_am_i") ? "who_am_i" : null);

    if (!probe) {
      return {
        ok: true,
        detail: `Connected. ${tools.tools.length} tools available, but no read-only probe (${
          connection.provider === "higgsfield" ? "balance" : "who_am_i"
        }) to confirm the account.`,
      };
    }

    const result = await client.callTool({ name: probe, arguments: {} });
    if (result.isError) {
      return { ok: false, detail: `Connected, but ${probe} failed: ${summarise(result.content)}` };
    }

    return { ok: true, detail: `Connected. ${probe} → ${summarise(result.content)}` };
  } finally {
    await client.close().catch(() => {});
  }
}

/** Record a test result against the stored connection so Settings shows live state. */
export async function recordTest(connectionId: number, result: TestResult): Promise<void> {
  await query(
    `UPDATE connections
        SET test_status = $2, test_detail = $3, tested_at = now(), updated_at = now()
      WHERE id = $1`,
    [connectionId, result.ok ? "ok" : "failed", result.detail.slice(0, 1000)],
  );
}

function summarise(content: unknown): string {
  if (!Array.isArray(content)) return String(content).slice(0, 200);
  return content
    .map((block) => (block && typeof block === "object" && "text" in block ? String((block as { text: unknown }).text) : ""))
    .join(" ")
    .trim()
    .slice(0, 200);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Anthropic's typed errors carry a status that is far more useful than the
    // default message when diagnosing a bad key.
    const status = (error as { status?: number }).status;
    return status ? `${status}: ${error.message}` : error.message;
  }
  return String(error);
}

export type { Provider };
