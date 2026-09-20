"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(((await response.json()) as { error?: string }).error ?? "Sign-in failed");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: "12vh auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 20 }}>Build Pipeline</h1>
      <form onSubmit={submit} className="card" style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Email</span>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required autoComplete="username" style={inputStyle}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Password</span>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required autoComplete="current-password" style={inputStyle}
          />
        </label>
        {error && <p className="badge" data-tone="error" style={{ justifySelf: "start" }}>{error}</p>}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
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
};

const buttonStyle: React.CSSProperties = {
  background: "var(--fill-accent)",
  color: "var(--surface-2)",
  border: 0,
  borderRadius: "var(--radius)",
  padding: "9px 14px",
  fontSize: 14,
  cursor: "pointer",
};
