/**
 * Provider connections.
 *
 * Everything the pipeline needs to reach an outside service is configured here
 * rather than in env vars, so a team member can connect, test and rotate a
 * credential without a redeploy. Env stays supported as a fallback, which
 * keeps local development and CI working with nothing stored.
 *
 * Resolution order is deliberate: a stored connection wins over the
 * environment. Otherwise someone rotating a key in Settings would be quietly
 * overridden by a stale env var and have no way to see why.
 */

import { one, query } from "@/db/client";
import { seal, open, hint, encryptionConfigured, type SealedSecret } from "./crypto";

export const PROVIDERS = ["anthropic", "higgsfield", "kling", "elevenlabs", "heygen"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type ConnectionKind = "api" | "mcp" | "cli";

/** Which kinds each provider actually supports, and what each kind needs. */
export const PROVIDER_SPEC: Record<Provider, {
  label: string;
  purpose: string;
  kinds: ConnectionKind[];
  envFallback: string[];
}> = {
  anthropic: {
    label: "Anthropic",
    purpose: "The model calls behind every step — absorption, casting, derivation, the visual checks.",
    kinds: ["api"],
    envFallback: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  },
  higgsfield: {
    label: "Higgsfield",
    purpose: "Image generation from step 3 — reference sheets, property plates, scene plates.",
    kinds: ["mcp", "api", "cli"],
    envFallback: ["HIGGSFIELD_MCP_URL", "HIGGSFIELD_MCP_TOKEN"],
  },
  kling: {
    label: "Kling",
    purpose: "Video generation — the I2V route for beats, and the source clips for the voice route.",
    kinds: ["mcp", "api"],
    envFallback: ["KLING_MCP_URL", "KLING_MCP_TOKEN"],
  },
  elevenlabs: {
    label: "ElevenLabs",
    purpose: "Instant Voice Clone from the source clips, then Eleven v3 speech in that voice.",
    kinds: ["api"],
    envFallback: ["ELEVENLABS_API_KEY"],
  },
  heygen: {
    label: "HeyGen",
    purpose: "Avatar V talking heads — identity learned from the source clips, lip-synced to the chosen take.",
    kinds: ["api"],
    envFallback: ["HEYGEN_API_KEY"],
  },
};

/** The secret bundle stored for each kind. */
export interface ApiSecret { apiKey: string }
export interface McpSecret { token: string }
export interface CliSecret { credentialsJson: string }
export type ConnectionSecret = ApiSecret | McpSecret | CliSecret;

export interface ConnectionConfig {
  /** MCP endpoint, or an API base URL override. */
  url?: string;
  workspaceId?: string;
}

/** What the API returns. Never carries a secret. */
export interface ConnectionView {
  id: number;
  provider: Provider;
  kind: ConnectionKind;
  label: string;
  config: ConnectionConfig;
  secretHint: string | null;
  isActive: boolean;
  testStatus: "ok" | "failed" | "untested";
  testDetail: string | null;
  testedAt: string | null;
  updatedAt: string;
}

interface ConnectionRow extends Record<string, unknown> {
  id: number;
  provider: Provider;
  kind: ConnectionKind;
  label: string;
  config: ConnectionConfig;
  secret_cipher: Buffer | null;
  secret_iv: Buffer | null;
  secret_tag: Buffer | null;
  secret_hint: string | null;
  is_active: boolean;
  test_status: "ok" | "failed" | "untested";
  test_detail: string | null;
  tested_at: string | null;
  updated_at: string;
}

function toView(row: ConnectionRow): ConnectionView {
  return {
    // node-postgres returns BIGSERIAL as a string to avoid precision loss.
    // Coerce here so the declared type is the truth rather than a hope.
    id: Number(row.id),
    provider: row.provider,
    kind: row.kind,
    label: row.label,
    config: row.config ?? {},
    secretHint: row.secret_hint,
    isActive: row.is_active,
    testStatus: row.test_status,
    testDetail: row.test_detail,
    testedAt: row.tested_at,
    updatedAt: row.updated_at,
  };
}

export async function listConnections(): Promise<ConnectionView[]> {
  const rows = await query<ConnectionRow>(
    `SELECT * FROM connections ORDER BY provider, is_active DESC, id DESC`,
  );
  return rows.map(toView);
}

export interface SaveConnectionInput {
  provider: Provider;
  kind: ConnectionKind;
  label?: string;
  config?: ConnectionConfig;
  secret: ConnectionSecret;
  userId?: number | null;
}

export async function saveConnection(input: SaveConnectionInput): Promise<ConnectionView> {
  const { provider, kind, label = "", config = {}, secret, userId = null } = input;

  if (!PROVIDER_SPEC[provider]?.kinds.includes(kind)) {
    throw new Error(`${provider} does not support a "${kind}" connection.`);
  }

  const primary = primarySecretOf(secret);
  if (!primary.trim()) throw new Error("The secret is empty.");

  const sealed = seal(JSON.stringify(secret));

  // Deactivate any existing active connection for this provider first: the
  // partial unique index allows only one, and replacing is the common case.
  await query(`UPDATE connections SET is_active = false, updated_at = now() WHERE provider = $1 AND is_active`, [provider]);

  const row = await one<ConnectionRow>(
    `INSERT INTO connections
       (provider, kind, label, config, secret_cipher, secret_iv, secret_tag, secret_hint, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
     RETURNING *`,
    [provider, kind, label, JSON.stringify(config), sealed.cipher, sealed.iv, sealed.tag, hint(primary), userId],
  );

  return toView(row!);
}

export async function deleteConnection(id: number): Promise<void> {
  await query(`DELETE FROM connections WHERE id = $1`, [id]);
}

export async function activateConnection(id: number): Promise<void> {
  const row = await one<{ provider: Provider }>(`SELECT provider FROM connections WHERE id = $1`, [id]);
  if (!row) throw new Error("No such connection.");
  await query(`UPDATE connections SET is_active = false, updated_at = now() WHERE provider = $1 AND is_active`, [row.provider]);
  await query(`UPDATE connections SET is_active = true, updated_at = now() WHERE id = $1`, [id]);
}

/** The resolved, decrypted connection a caller can actually use. */
export interface ResolvedConnection {
  provider: Provider;
  kind: ConnectionKind;
  config: ConnectionConfig;
  secret: ConnectionSecret;
  /** Where it came from, so an operator can tell which credential ran. */
  source: "settings" | "env";
}

/**
 * Resolve a provider to a usable credential.
 *
 * A stored connection wins over the environment — see the note at the top of
 * this file on why that order and not the reverse.
 */
export async function resolveConnection(provider: Provider): Promise<ResolvedConnection | null> {
  // A stored connection needs the database; an environment variable does not.
  // So a database failure falls through to env rather than throwing — the
  // unreachable database is reported by its own readiness check, and there is
  // no reason for it to also hide a perfectly good env var.
  let row: ConnectionRow | undefined;
  try {
    row = await one<ConnectionRow>(
      `SELECT * FROM connections WHERE provider = $1 AND is_active LIMIT 1`,
      [provider],
    );
  } catch {
    return resolveFromEnv(provider);
  }

  if (row?.secret_cipher && row.secret_iv && row.secret_tag) {
    const sealed: SealedSecret = { cipher: row.secret_cipher, iv: row.secret_iv, tag: row.secret_tag };
    return {
      provider,
      kind: row.kind,
      config: row.config ?? {},
      secret: JSON.parse(open(sealed)) as ConnectionSecret,
      source: "settings",
    };
  }

  return resolveFromEnv(provider);
}

function resolveFromEnv(provider: Provider): ResolvedConnection | null {
  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey) return null;
    return { provider, kind: "api", config: {}, secret: { apiKey }, source: "env" };
  }

  // Providers reached by a plain API key rather than an MCP endpoint.
  if (provider === "elevenlabs" || provider === "heygen") {
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    if (!apiKey) return null;
    return { provider, kind: "api", config: {}, secret: { apiKey }, source: "env" };
  }

  const prefix = provider === "higgsfield" ? "HIGGSFIELD" : "KLING";
  const url = process.env[`${prefix}_MCP_URL`];
  const token = process.env[`${prefix}_MCP_TOKEN`];
  if (!url) return null;
  return { provider, kind: "mcp", config: { url }, secret: { token: token ?? "" }, source: "env" };
}

export class ConnectionMissingError extends Error {
  constructor(public readonly provider: Provider) {
    super(
      `No ${PROVIDER_SPEC[provider].label} connection is configured. ` +
        `Add one in Settings, or set ${PROVIDER_SPEC[provider].envFallback.join(" / ")}.`,
    );
    this.name = "ConnectionMissingError";
  }
}

export async function requireConnection(provider: Provider): Promise<ResolvedConnection> {
  const resolved = await resolveConnection(provider);
  if (!resolved) throw new ConnectionMissingError(provider);
  return resolved;
}

function primarySecretOf(secret: ConnectionSecret): string {
  if ("apiKey" in secret) return secret.apiKey;
  if ("token" in secret) return secret.token;
  return secret.credentialsJson;
}

export { encryptionConfigured };
