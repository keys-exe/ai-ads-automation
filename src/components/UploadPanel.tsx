"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { friendly } from "@/lib/friendly-errors";

/**
 * The upload bundle — one panel, five boxes, filled once.
 *
 * §E9 makes the build directory the working store for the whole build, so the
 * bundle is uploaded once here and every later step reads from it rather than
 * asking again. The fifth box is optional and its absence is load-bearing:
 * with no worn-placement reference, §9D blocks REVEAL beats until one exists,
 * and the step-2 prompt label drops its PRODUCT PLACEMENT clause.
 */

export interface AssetSummary {
  id: number;
  kind: AssetKind;
  filename: string;
  byte_size: number;
  source_url: string | null;
}

export type AssetKind =
  | "inspo_video"
  | "script"
  | "product"
  | "product_sheet"
  | "product_placement";

interface BoxSpec {
  kind: AssetKind;
  title: string;
  feeds: string;
  accept: string;
  multiple: boolean;
  required: boolean;
  allowUrl?: boolean;
  note?: string;
}

const BOXES: BoxSpec[] = [
  {
    kind: "inspo_video",
    title: "Inspo video",
    feeds: "Step 1 — §42 all seven parts",
    accept: "video/*",
    multiple: false,
    required: true,
    allowUrl: true,
    note: "File or link. Instruments run on it before any interpretation.",
  },
  {
    kind: "script",
    title: "Script",
    feeds: "Step 2 — §27B phrase inventory, §43A claims pass",
    accept: ".txt,.md,.rtf,text/*",
    multiple: false,
    required: true,
    note: "Absorbed as written. Never edited to solve a build problem (§44.55).",
  },
  {
    kind: "product",
    title: "Product",
    feeds: "Step 2 — reference registry, §7 top of authority",
    accept: "image/*",
    multiple: true,
    required: true,
    note: "The canonical reference set. Outranks the script and every standard below it.",
  },
  {
    kind: "product_sheet",
    title: "Product Sheet",
    feeds: "Step 2 — Appendix B, eleven fields",
    accept: ".md,.txt,.py,text/*",
    multiple: true,
    required: false,
    note: "The .md + .py pair. Created at step 2 where absent (§44.39).",
  },
  {
    kind: "product_placement",
    title: "Product placement",
    feeds: "§9A-P placement lock, §9D visibility",
    accept: "image/*",
    multiple: true,
    required: false,
    note: "Optional. Without it, REVEAL beats are BLOCKED until a worn-placement reference exists.",
  },
];

export interface ProcessSummary {
  id: number;
  step: number;
  prompt_label: string;
  status: "queued" | "running" | "done" | "failed" | "blocked";
  stage: string;
  error: string | null;
}

export function UploadPanel({
  buildId,
  initialAssets,
  initialProcesses,
}: {
  buildId: number;
  initialAssets: AssetSummary[];
  initialProcesses: ProcessSummary[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [processes, setProcesses] = useState(initialProcesses);
  const [busyKind, setBusyKind] = useState<AssetKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const has = (kind: AssetKind) => assets.some((a) => a.kind === kind);
  const hasPlacement = has("product_placement");

  const live = processes.find((p) => p.status === "queued" || p.status === "running");

  // Poll only while something is in flight. A build sitting idle should not be
  // generating request traffic.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/builds/${buildId}/status`);
      if (!response.ok) return;
      const data = (await response.json()) as { processes: ProcessSummary[] };
      setProcesses(data.processes);
    }, 2000);
    return () => clearInterval(timer);
  }, [live, buildId]);

  const upload = useCallback(
    async (kind: AssetKind, files: FileList | null, sourceUrl?: string) => {
      if (!files?.length && !sourceUrl) return;
      setBusyKind(kind);
      setError(null);
      try {
        const uploaded: AssetSummary[] = [];
        const items = files ? Array.from(files) : [null];
        for (const file of items) {
          const form = new FormData();
          form.set("kind", kind);
          if (file) form.set("file", file);
          if (sourceUrl) form.set("source_url", sourceUrl);
          const response = await fetch(`/api/builds/${buildId}/assets`, { method: "POST", body: form });
          if (!response.ok) {
            throw new Error(((await response.json()) as { error?: string }).error ?? "Upload failed");
          }
          const row = (await response.json()) as { id: number };
          uploaded.push({
            id: row.id,
            kind,
            filename: file?.name ?? sourceUrl ?? "",
            byte_size: file?.size ?? 0,
            source_url: sourceUrl ?? null,
          });
        }
        setAssets((prev) => {
          const single = kind === "inspo_video" || kind === "script";
          const kept = single ? prev.filter((a) => a.kind !== kind) : prev;
          return [...kept, ...uploaded];
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyKind(null);
      }
    },
    [buildId],
  );

  const remove = useCallback(
    async (asset: AssetSummary) => {
      await fetch(`/api/builds/${buildId}/assets?asset=${asset.id}`, { method: "DELETE" });
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    },
    [buildId],
  );

  const run = useCallback(
    async (step: 1 | 2 | 3 | 4 | 5) => {
      setError(null);
      const response = await fetch(`/api/builds/${buildId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      });
      if (!response.ok) {
        setError(((await response.json()) as { error?: string }).error ?? "Could not start the step");
        return;
      }
      const status = await fetch(`/api/builds/${buildId}/status`);
      if (status.ok) setProcesses(((await status.json()) as { processes: ProcessSummary[] }).processes);
    },
    [buildId],
  );

  const stepProcess = (step: number) => processes.find((p) => p.step === step);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section>
        <h2 style={sectionHeading}>Bundle</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
          Uploaded once. Both steps read from here — nothing is asked for twice.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {BOXES.map((box) => (
            <UploadBox
              key={box.kind}
              spec={box}
              assets={assets.filter((a) => a.kind === box.kind)}
              busy={busyKind === box.kind}
              onUpload={upload}
              onRemove={remove}
            />
          ))}
        </div>
      </section>

      {error && (
        <p className="badge" data-tone="error" style={{ justifySelf: "start" }}>{error}</p>
      )}

      <section>
        <h2 style={sectionHeading}>Build order</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
          §18 steps 1–5. None gates another — the only gate in the build is step 6, the hooks.
          Steps 3, 4 and 5 chain: starting the cast runs the rest without another click.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <ProcessButton
            step={1}
            label="ABSORB INSPO VIDEO"
            description="§42's seven parts. Instruments run first, then the model reads what they measured."
            enabled={has("inspo_video")}
            disabledReason="Upload an inspo video first"
            process={stepProcess(1)}
            onRun={() => run(1)}
            cost="~$0.30 · no image or video credits"
          />
          <ProcessButton
            step={2}
            label={
              hasPlacement
                ? "ABSORB THIS SCRIPT, PRODUCT, PRODUCT PLACEMENT AND PRODUCT SHEET"
                : "ABSORB THIS SCRIPT, PRODUCT, AND PRODUCT SHEET"
            }
            description={
              hasPlacement
                ? "Phrase inventory, claims pass, Mode & Model Lock, placement lock."
                : "Phrase inventory, claims pass, Mode & Model Lock. No placement reference — REVEAL beats will be BLOCKED."
            }
            enabled={has("script") && has("product")}
            disabledReason="Upload a script and at least one product reference first"
            process={stepProcess(2)}
            onRun={() => run(2)}
            cost="~$0.30 · no image or video credits"
          />
          <ProcessButton
            step={3}
            label="CAST — GENERATE REFERENCE SHEETS"
            description="Everyone with two or more beats gets a §19 sheet. Panel-checked, locked, then step 4 starts itself."
            enabled={Boolean(stepProcess(2)?.status === "done")}
            disabledReason="Run step 2 first — casting reads its phrase inventory"
            process={stepProcess(3)}
            onRun={() => run(3)}
            chainsTo="starts steps 4 and 5"
            cost="Anthropic + Higgsfield image credits"
            spendsCredits
          />
          <ProcessButton
            step={4}
            label="PROPERTY AND LOCATION MAPS"
            description="C0 first, then the eight-channel pass. Property plate is generated and checked before any room is built against it."
            enabled={Boolean(stepProcess(3)?.status === "done")}
            disabledReason="Starts automatically when the cast locks"
            process={stepProcess(4)}
            onRun={() => run(4)}
            automatic
            cost="Anthropic + Higgsfield image credits"
            spendsCredits
          />
          <ProcessButton
            step={5}
            label="ACT MAP AND WARDROBE MAP"
            description="Story-day derivation, the wardrobe ledger with its four audits, the act map, and the coverage ledger. No generation."
            enabled={Boolean(stepProcess(4)?.status === "done")}
            disabledReason="Starts automatically when the locations close"
            process={stepProcess(5)}
            onRun={() => run(5)}
            automatic
            cost="~$0.25 · no image or video credits"
          />
        </div>
      </section>
    </div>
  );
}

function UploadBox({
  spec,
  assets,
  busy,
  onUpload,
  onRemove,
}: {
  spec: BoxSpec;
  assets: AssetSummary[];
  busy: boolean;
  onUpload: (kind: AssetKind, files: FileList | null, sourceUrl?: string) => void;
  onRemove: (asset: AssetSummary) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");

  const filled = assets.length > 0;

  return (
    <div
      className="card"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onUpload(spec.kind, e.dataTransfer.files);
      }}
      style={{
        borderColor: dragging ? "var(--border-accent)" : "var(--border)",
        borderStyle: filled ? "solid" : "dashed",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{spec.title}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8, fontFamily: "var(--font-mono)" }}>
            {spec.feeds}
          </span>
        </div>
        <span className="badge" data-tone={filled ? "ok" : spec.required ? "warn" : undefined}>
          {filled ? `${assets.length} file${assets.length === 1 ? "" : "s"}` : spec.required ? "required" : "optional"}
        </span>
      </div>

      {spec.note && (
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "6px 0 10px" }}>{spec.note}</p>
      )}

      {filled && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "grid", gap: 4 }}>
          {assets.map((a) => (
            <li key={a.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "5px 9px",
              fontSize: 12.5, fontFamily: "var(--font-mono)",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.source_url ?? a.filename}
                {a.byte_size > 0 && (
                  <span style={{ color: "var(--text-muted)" }}> · {formatBytes(a.byte_size)}</span>
                )}
              </span>
              <button onClick={() => onRemove(a)} style={linkButton} aria-label={`Remove ${a.filename}`}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="file"
          accept={spec.accept}
          multiple={spec.multiple}
          hidden
          onChange={(e) => onUpload(spec.kind, e.target.files)}
        />
        <button onClick={() => inputRef.current?.click()} disabled={busy} style={secondaryButton}>
          {busy ? "Uploading…" : filled && !spec.multiple ? "Replace" : "Choose file"}
        </button>

        {spec.allowUrl && (
          <>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="or paste a link"
              style={{
                flex: 1, minWidth: 180, background: "var(--surface-1)",
                border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                color: "var(--text-primary)", padding: "7px 9px", fontSize: 13, fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => { onUpload(spec.kind, null, url.trim()); setUrl(""); }}
              disabled={!url.trim() || busy}
              style={secondaryButton}
            >
              Add link
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ProcessButton({
  step,
  label,
  description,
  enabled,
  disabledReason,
  process,
  onRun,
  chainsTo,
  automatic,
  spendsCredits,
  cost,
}: {
  step: number;
  label: string;
  description: string;
  enabled: boolean;
  disabledReason: string;
  process?: ProcessSummary;
  onRun: () => void;
  /** Named where finishing this step starts others. */
  chainsTo?: string;
  /** True where the step normally starts itself; Run stays available as a re-run. */
  automatic?: boolean;
  spendsCredits?: boolean;
  /** Shown before the click, so the price is never a surprise afterwards. */
  cost?: string;
}) {
  const running = process?.status === "queued" || process?.status === "running";

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              step {step}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, letterSpacing: "0.01em" }}>{label}</span>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "6px 0 0" }}>{description}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {chainsTo && <span className="badge" data-tone="accent">{chainsTo}</span>}
            {automatic && <span className="badge">starts automatically</span>}
            {spendsCredits && <span className="badge" data-tone="warn">spends credits</span>}
            {cost && <span className="badge">{cost}</span>}
          </div>
        </div>
        <button onClick={onRun} disabled={!enabled || running} style={enabled && !running ? primaryButton : disabledButton}>
          {running ? "Running…" : automatic ? "Re-run" : "Run"}
        </button>
      </div>

      {!enabled && !process && (
        <p className="badge" data-tone="warn" style={{ marginTop: 10, display: "inline-block" }}>{disabledReason}</p>
      )}

      {process && (
        <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge" data-tone={
            process.status === "done" ? "ok" : process.status === "failed" ? "error" : "accent"
          }>
            {process.status}
          </span>
          {running && <span className="badge">{process.stage}</span>}
          {process.error && <FriendlyFailure raw={process.error} />}
        </div>
      )}
    </div>
  );
}

/**
 * A failure, stated as an instruction.
 *
 * The raw message is kept behind a disclosure rather than dropped — it is what
 * anyone debugging actually needs, and hiding it entirely would trade one kind
 * of unhelpfulness for another.
 */
function FriendlyFailure({ raw }: { raw: string }) {
  const f = friendly(new Error(raw));
  return (
    <div style={{
      flexBasis: "100%", marginTop: 8, padding: "10px 12px",
      background: "var(--surface-1)", borderRadius: "var(--radius)",
      borderLeft: "3px solid var(--hl-negatives)",
    }}>
      <p style={{ fontSize: 13.5, margin: 0 }}>{f.summary}</p>
      {f.fix && (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0" }}>{f.fix}</p>
      )}
      {f.href && (
        <a href={f.href} style={{
          display: "inline-block", marginTop: 8, fontSize: 12.5,
          color: "var(--fill-accent)", textDecoration: "none",
        }}>
          Open Settings →
        </a>
      )}
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer" }}>
          Technical detail
        </summary>
        <pre className="prompt" style={{ marginTop: 6, fontSize: 11 }}>{f.technical}</pre>
      </details>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const sectionHeading: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: "0 0 4px",
};

const primaryButton: React.CSSProperties = {
  background: "var(--fill-accent)", color: "var(--surface-2)", border: 0,
  borderRadius: "var(--radius)", padding: "8px 16px", fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
};

const disabledButton: React.CSSProperties = {
  ...primaryButton, background: "var(--bg-neutral)", color: "var(--text-muted)", cursor: "not-allowed",
};

const secondaryButton: React.CSSProperties = {
  background: "var(--surface-1)", color: "var(--text-primary)",
  border: "0.5px solid var(--border-stronger)", borderRadius: "var(--radius)",
  padding: "7px 12px", fontSize: 13, cursor: "pointer",
};

const linkButton: React.CSSProperties = {
  background: "none", border: 0, color: "var(--text-muted)",
  fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "0 0 0 10px",
};
