-- Provider connections, configured in Settings rather than baked into env.
--
-- Three connection kinds, because the providers genuinely differ:
--   'api' — a bare API key (Anthropic).
--   'mcp' — an endpoint URL plus a bearer token (Higgsfield, Kling).
--   'cli' — the credentials file a local CLI login produced, pasted in.
--
-- Secrets are stored encrypted (AES-256-GCM) and never leave the server in
-- plaintext: the API returns a masked hint only.
CREATE TABLE IF NOT EXISTS connections (
  id             BIGSERIAL PRIMARY KEY,
  -- 'anthropic' | 'higgsfield' | 'kling'
  provider       TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('api', 'mcp', 'cli')),
  label          TEXT NOT NULL DEFAULT '',
  -- Non-secret configuration: the MCP URL, a base URL, a workspace id.
  config         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- AES-256-GCM over the JSON secret bundle. Never returned to a client.
  secret_cipher  BYTEA,
  secret_iv      BYTEA,
  secret_tag     BYTEA,
  -- Last 4 characters of the primary secret, for recognising which key is set
  -- without exposing it.
  secret_hint    TEXT,
  -- Only one connection per provider is active at a time; the others are kept
  -- so rotating back is a click rather than a re-paste.
  is_active      BOOLEAN NOT NULL DEFAULT true,
  -- Result of the most recent test: ok | failed | untested, with its detail.
  test_status    TEXT NOT NULL DEFAULT 'untested',
  test_detail    TEXT,
  tested_at      TIMESTAMPTZ,
  created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active connection per provider. A partial unique index rather
-- than a constraint, so inactive rows can pile up freely as history.
CREATE UNIQUE INDEX IF NOT EXISTS connections_active_provider_idx
  ON connections (provider) WHERE is_active;
