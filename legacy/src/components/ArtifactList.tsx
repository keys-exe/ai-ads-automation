"use client";

import { useState } from "react";

/**
 * §16A routes each artefact class to one of four widget shapes. Step 1 and
 * step 2 produce multi-dimensional artefacts, so both take the Navigator:
 * metric cards across the top, then a tab bar, then one panel at a time.
 *
 * Counts on the metric cards are computed from the payload, never typed —
 * §16A makes that structural: "a typed count drifts from its string the first
 * time the string is edited; a computed one cannot."
 */

interface Artifact {
  id: number;
  kind: string;
  payload: unknown;
  created_at: string;
}

const TITLES: Record<string, string> = {
  measurements: "Part 1 — measured",
  absorption_sheet: "Absorption Sheet",
  script_absorption: "Step 2 — locks, inventory, claims",
  cast: "Step 3 — cast and reference sheets",
  locations: "Step 4 — property and locations",
  maps: "Step 5 — act map and wardrobe map",
};

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  const [active, setActive] = useState(artifacts[0]?.kind ?? "");
  const current = artifacts.find((a) => a.kind === active) ?? artifacts[0];

  return (
    <section>
      <h2 style={{
        fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase",
        color: "var(--text-muted)", margin: "0 0 10px",
      }}>
        Artefacts
      </h2>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {artifacts.map((a) => (
          <button
            key={a.kind}
            onClick={() => setActive(a.kind)}
            style={{
              background: a.kind === active ? "var(--surface-1)" : "transparent",
              border: `0.5px solid ${a.kind === active ? "var(--border-stronger)" : "var(--border)"}`,
              borderRadius: "var(--radius)", color: "var(--text-primary)",
              padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {TITLES[a.kind] ?? a.kind}
          </button>
        ))}
      </div>

      {current && <ArtifactPanel artifact={current} />}
    </section>
  );
}

function ArtifactPanel({ artifact }: { artifact: Artifact }) {
  const metrics = deriveMetrics(artifact);
  const json = JSON.stringify(artifact.payload, null, 2);

  return (
    <div className="card">
      {metrics.length > 0 && (
        <div style={{
          display: "grid", gap: 8, marginBottom: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        }}>
          {metrics.map((m) => (
            <div key={m.label} style={{
              background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "9px 11px",
            }}>
              <div style={{ fontSize: 19, fontFamily: "var(--font-mono)" }}>{m.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
          Full artefact ({json.length.toLocaleString()} chars)
        </summary>
        <pre className="prompt" style={{ marginTop: 8, maxHeight: 520, overflow: "auto" }}>{json}</pre>
      </details>
    </div>
  );
}

/**
 * §45's show-the-number rule: every count the standards impose is visible on
 * the deliverable that carries it. These are read off the payload at render.
 */
function deriveMetrics(artifact: Artifact): Array<{ label: string; value: string }> {
  const p = artifact.payload as Record<string, never> | null;
  if (!p) return [];

  const num = (v: unknown): string =>
    typeof v === "number" ? v.toLocaleString() : Array.isArray(v) ? v.length.toLocaleString() : "—";

  if (artifact.kind === "measurements") {
    const format = p["format"] as { durationSeconds?: number; aspectRatio?: string } | undefined;
    const scenes = p["scenes"] as { shotCount?: number; meanShotLength?: number } | undefined;
    const transcript = p["transcript"] as { wordCount?: number; wordsPerMinute?: number } | null | undefined;
    const ocr = p["ocr"] as { inventory?: unknown[] } | undefined;
    return [
      { label: "duration", value: format?.durationSeconds ? `${format.durationSeconds.toFixed(1)}s` : "—" },
      { label: "aspect", value: format?.aspectRatio ?? "—" },
      { label: "shots", value: num(scenes?.shotCount) },
      { label: "mean shot", value: scenes?.meanShotLength ? `${scenes.meanShotLength}s` : "—" },
      { label: "words", value: num(transcript?.wordCount) },
      { label: "wpm", value: num(transcript?.wordsPerMinute) },
      { label: "overlay strings", value: num(ocr?.inventory) },
    ];
  }

  if (artifact.kind === "absorption_sheet") {
    return [
      { label: "structure rows", value: num(p["structureMap"]) },
      { label: "R-P- phrases", value: num(p["referencePhrases"]) },
      { label: "tie-breaks", value: num(p["tieBreaks"]) },
      { label: "surfaced conflicts", value: num(p["surfacedConflicts"]) },
      { label: "claims harvested", value: num(p["claimsHarvest"]) },
      { label: "beat-it deltas", value: num(p["beatItPlan"]) },
      { label: "gate decisions", value: num(p["gateDecisions"]) },
    ];
  }

  if (artifact.kind === "script_absorption") {
    const rec = p["reconciliation"] as {
      claimsByTier?: { tier1?: number; tier2?: number; tier3?: number };
    } | undefined;
    return [
      { label: "P- phrases", value: num(p["phraseInventory"]) },
      { label: "claims", value: num(p["claims"]) },
      { label: "tier 1", value: num(rec?.claimsByTier?.tier1) },
      { label: "tier 2", value: num(rec?.claimsByTier?.tier2) },
      { label: "tier 3 → BLOCKED", value: num(rec?.claimsByTier?.tier3) },
      { label: "model routes", value: num(p["modelRoutes"]) },
      { label: "locks", value: num(p["locks"]) },
      { label: "collisions", value: num(p["collisions"]) },
    ];
  }

  if (artifact.kind === "cast") {
    const cast = (p["cast"] ?? []) as Array<{ speaks?: boolean; clearance?: Array<{ passes?: boolean }> }>;
    const speaking = cast.filter((c) => c.speaks).length;
    // §19A's gate is five of eight against every roster entry, proven.
    const cleared = cast.filter((c) => (c.clearance ?? []).every((x) => x.passes)).length;
    return [
      { label: "sheeted cast", value: num(cast) },
      { label: "speaking", value: String(speaking) },
      { label: "silent recurrers", value: String(cast.length - speaking) },
      { label: "axis-cleared", value: `${cleared}/${cast.length}` },
      { label: "one-off subjects", value: num(p["oneOffSubjects"]) },
    ];
  }

  if (artifact.kind === "locations") {
    const locations = (p["locations"] ?? []) as Array<{ tier?: string }>;
    const tier = (t: string) => locations.filter((l) => l.tier === t).length;
    return [
      { label: "locations", value: num(locations) },
      { label: "PLATED", value: String(tier("PLATED")) },
      { label: "INCIDENTAL", value: String(tier("INCIDENTAL")) },
      { label: "TRAVERSED", value: String(tier("TRAVERSED")) },
      { label: "dwellings", value: num(p["properties"]) },
    ];
  }

  if (artifact.kind === "maps") {
    const coverage = p["coverage"] as { uncovered?: number; blocked?: number; phraseCount?: number } | undefined;
    const audits = (p["independentAudits"] ?? []) as Array<{ pass?: boolean; disagreesWithModel?: boolean }>;
    const failing = audits.filter((a) => !a.pass).length;
    const disputed = audits.filter((a) => a.disagreesWithModel).length;
    return [
      { label: "beats", value: num(p["actMap"]) },
      { label: "story days", value: num(p["storyDays"]) },
      { label: "capture events", value: num(p["captureEvents"]) },
      { label: "uncovered", value: num(coverage?.uncovered) },
      { label: "blocked", value: num(coverage?.blocked) },
      { label: "audits failing", value: String(failing) },
      { label: "recount disputes", value: String(disputed) },
    ];
  }

  return [];
}
