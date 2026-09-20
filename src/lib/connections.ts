/**
 * Provider credentials.
 *
 * Credentials come from the environment and nowhere else. The earlier version
 * of this file kept them encrypted in a `connections` table with the
 * environment as a fallback, which existed so a Settings page could rotate a
 * key without a redeploy. There is no Settings page now — the pipeline is run
 * from a shell — so the table, the AES envelope and the key-rotation path all
 * go, and `.env` is the single source.
 *
 * `ResolvedConnection` keeps its shape so every caller is unchanged.
 */

export const PROVIDERS = ["anthropic", "higgsfield", "kling", "elevenlabs", "heygen"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type ConnectionKind = "api" | "mcp" | "cli";

/** What each provider is for, and which variables supply it. */
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
    kinds: ["mcp"],
    envFallback: ["HIGGSFIELD_MCP_URL", "HIGGSFIELD_MCP_TOKEN"],
  },
  kling: {
    label: "Kling",
    purpose: "Video generation — the I2V route for beats, and the source clips for the voice route.",
    kinds: ["mcp"],
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

export interface ApiSecret { apiKey: string }
export interface McpSecret { token: string }
export interface CliSecret { credentialsJson: string }
export type ConnectionSecret = ApiSecret | McpSecret | CliSecret;

export interface ConnectionConfig {
  /** MCP endpoint, or an API base URL override. */
  url?: string;
  workspaceId?: string;
}

export interface ResolvedConnection {
  provider: Provider;
  kind: ConnectionKind;
  config: ConnectionConfig;
  secret: ConnectionSecret;
  /** Kept so a caller can still say where the credential came from. */
  source: "env";
}

export async function resolveConnection(provider: Provider): Promise<ResolvedConnection | null> {
  return resolveFromEnv(provider);
}

export function resolveFromEnv(provider: Provider): ResolvedConnection | null {
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
      `No ${PROVIDER_SPEC[provider].label} credential. Set ` +
        `${PROVIDER_SPEC[provider].envFallback.join(" / ")} in your environment or .env.`,
    );
    this.name = "ConnectionMissingError";
  }
}

export async function requireConnection(provider: Provider): Promise<ResolvedConnection> {
  const resolved = await resolveConnection(provider);
  if (!resolved) throw new ConnectionMissingError(provider);
  return resolved;
}

/** Which providers currently have a credential. Used by the readiness report. */
export function configuredProviders(): Provider[] {
  return PROVIDERS.filter((provider) => resolveFromEnv(provider) !== null);
}
