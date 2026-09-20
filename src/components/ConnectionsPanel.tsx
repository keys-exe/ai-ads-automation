"use client";

import { useState } from "react";
import type { ConnectionKind, ConnectionView, Provider } from "@/lib/connections";

interface ProviderSpec {
  id: Provider;
  label: string;
  purpose: string;
  kinds: ConnectionKind[];
  envFallback: string[];
}

const KIND_LABEL: Record<ConnectionKind, string> = {
  api: "API key",
  mcp: "MCP endpoint",
  cli: "CLI credentials",
};

const KIND_HELP: Record<ConnectionKind, string> = {
  api: "A key from the provider's dashboard.",
  mcp: "An MCP endpoint URL and bearer token. This is what the worker uses to generate.",
  cli: "The credentials file a local CLI login produced. Stored, but the worker cannot generate through it.",
};

export function ConnectionsPanel({
  initialConnections,
  encryptionConfigured,
  providers,
}: {
  initialConnections: ConnectionView[];
  encryptionConfigured: boolean;
  providers: ProviderSpec[];
}) {
  const [connections, setConnections] = useState(initialConnections);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/connections");
    if (response.ok) {
      setConnections(((await response.json()) as { connections: ConnectionView[] }).connections);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {!encryptionConfigured && (
        <div className="card" style={{ borderColor: "var(--hl-negatives)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span className="badge" data-tone="error">blocked</span>
            <strong style={{ fontSize: 14 }}>No encryption key configured</strong>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 0" }}>
            Secrets are stored encrypted, and this app will not fall back to writing them in
            plaintext. Set <code style={codeStyle}>SETTINGS_ENCRYPTION_KEY</code> and restart:
          </p>
          <pre className="prompt" style={{ marginTop: 8 }}>openssl rand -base64 32</pre>
        </div>
      )}

      {error && <p className="badge" data-tone="error" style={{ justifySelf: "start" }}>{error}</p>}

      {providers.map((spec) => (
        <ProviderCard
          key={spec.id}
          spec={spec}
          connections={connections.filter((c) => c.provider === spec.id)}
          disabled={!encryptionConfigured}
          onChanged={refresh}
          onError={setError}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  spec,
  connections,
  disabled,
  onChanged,
  onError,
}: {
  spec: ProviderSpec;
  connections: ConnectionView[];
  disabled: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const active = connections.find((c) => c.isActive);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ConnectionKind>(spec.kinds[0]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError(null);

    const body: Record<string, string> = { provider: spec.id, kind };
    if (kind === "api") body.apiKey = secret;
    if (kind === "mcp") { body.url = url; body.token = secret; }
    if (kind === "cli") body.credentialsJson = secret;

    const response = await fetch("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (!response.ok) {
      onError(((await response.json()) as { error?: string }).error ?? "Could not save");
      return;
    }
    // The secret is gone from the page the moment it is stored.
    setSecret("");
    setUrl("");
    setOpen(false);
    await onChanged();
  }

  async function test(id: number) {
    setTesting(true);
    onError(null);
    const response = await fetch(`/api/connections/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    setTesting(false);
    if (!response.ok) onError(((await response.json()) as { error?: string }).error ?? "Test failed");
    await onChanged();
  }

  async function remove(id: number) {
    await fetch(`/api/connections/${id}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>{spec.label}</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "5px 0 0" }}>{spec.purpose}</p>
        </div>
        <span className="badge" data-tone={active ? (active.testStatus === "ok" ? "ok" : active.testStatus === "failed" ? "error" : "warn") : undefined}>
          {active ? (active.testStatus === "ok" ? "connected" : active.testStatus === "failed" ? "failing" : "untested") : "not connected"}
        </span>
      </div>

      {active && (
        <div style={{ marginTop: 12, background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontFamily: "var(--font-mono)" }}>
              {KIND_LABEL[active.kind]} · {active.secretHint ?? "no secret"}
              {active.config.url && (
                <span style={{ color: "var(--text-muted)" }}> · {active.config.url}</span>
              )}
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <button onClick={() => test(active.id)} disabled={testing} style={smallButton}>
                {testing ? "Testing…" : "Test"}
              </button>
              <button onClick={() => remove(active.id)} style={smallButton}>Remove</button>
            </span>
          </div>
          {active.testDetail && (
            <p style={{
              fontSize: 12, margin: "8px 0 0",
              color: active.testStatus === "ok" ? "var(--hl-string-value)" : "var(--hl-negatives)",
            }}>
              {active.testDetail}
            </p>
          )}
        </div>
      )}

      {!active && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "10px 0 0" }}>
          Falls back to <code style={codeStyle}>{spec.envFallback.join("</code> / <code>")}</code> if set in the environment.
        </p>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} disabled={disabled} style={{ ...smallButton, marginTop: 12 }}>
          {active ? "Replace connection" : "Connect"}
        </button>
      ) : (
        <form onSubmit={save} style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {spec.kinds.length > 1 && (
            <div style={{ display: "flex", gap: 6 }}>
              {spec.kinds.map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  style={{
                    ...smallButton,
                    background: k === kind ? "var(--surface-1)" : "transparent",
                    borderColor: k === kind ? "var(--border-stronger)" : "var(--border)",
                  }}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{KIND_HELP[kind]}</p>

          {kind === "mcp" && (
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/mcp" required style={inputStyle}
            />
          )}

          {kind === "cli" ? (
            <textarea
              value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder="Paste the contents of credentials.json"
              required rows={5} style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          ) : (
            <input
              type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder={kind === "api" ? "API key" : "Bearer token"}
              required={kind === "api"} autoComplete="off" style={inputStyle}
            />
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={busy} style={primaryButton}>
              {busy ? "Saving…" : "Save connection"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setSecret(""); }} style={smallButton}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  border: "0.5px solid var(--border-stronger)",
  borderRadius: "var(--radius)",
  color: "var(--text-primary)",
  padding: "8px 10px",
  fontSize: 14,
  fontFamily: "inherit",
  width: "100%",
};

const primaryButton: React.CSSProperties = {
  background: "var(--fill-accent)", color: "var(--surface-2)", border: 0,
  borderRadius: "var(--radius)", padding: "8px 14px", fontSize: 13.5, cursor: "pointer",
};

const smallButton: React.CSSProperties = {
  background: "var(--surface-1)", color: "var(--text-primary)",
  border: "0.5px solid var(--border-stronger)", borderRadius: "var(--radius)",
  padding: "6px 11px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 12,
  background: "var(--bg-neutral)", padding: "1px 5px", borderRadius: 3,
};
