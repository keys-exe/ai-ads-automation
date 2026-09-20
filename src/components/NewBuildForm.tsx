"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewBuildForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/builds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(((await response.json()) as { error?: string }).error ?? "Could not create the build");
      return;
    }
    const { id } = (await response.json()) as { id: number };
    router.push(`/build/${id}`);
  }

  return (
    <form onSubmit={create} className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New build name"
        style={{
          flex: 1, background: "var(--surface-1)", border: "0.5px solid var(--border-stronger)",
          borderRadius: "var(--radius)", color: "var(--text-primary)", padding: "8px 10px",
          fontSize: 14, fontFamily: "inherit",
        }}
      />
      <button type="submit" disabled={busy || !name.trim()} style={{
        background: "var(--fill-accent)", color: "var(--surface-2)", border: 0,
        borderRadius: "var(--radius)", padding: "9px 14px", fontSize: 14, cursor: "pointer",
      }}>
        {busy ? "Creating…" : "Create build"}
      </button>
      {error && <span className="badge" data-tone="error">{error}</span>}
    </form>
  );
}
