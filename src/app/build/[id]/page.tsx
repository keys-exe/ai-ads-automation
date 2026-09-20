import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { one, query } from "@/db/client";
import { currentUser } from "@/lib/auth";
import { UploadPanel, type AssetSummary, type ProcessSummary } from "@/components/UploadPanel";
import { ArtifactList } from "@/components/ArtifactList";

export const dynamic = "force-dynamic";

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const buildId = Number((await params).id);
  if (!Number.isInteger(buildId)) notFound();

  const build = await one<{ id: number; name: string; standards_version: string; declared: unknown }>(
    `SELECT id, name, standards_version, declared FROM builds WHERE id = $1`,
    [buildId],
  );
  if (!build) notFound();

  const assets = await query<AssetSummary & Record<string, unknown>>(
    `SELECT id, kind, filename, byte_size, source_url FROM assets WHERE build_id = $1 ORDER BY id`,
    [buildId],
  );

  const processes = await query<ProcessSummary & Record<string, unknown>>(
    `SELECT id, step, prompt_label, status::text AS status, stage, error
       FROM processes WHERE build_id = $1 ORDER BY id DESC`,
    [buildId],
  );

  const artifacts = await query<{ id: number; kind: string; payload: unknown; created_at: string }>(
    `SELECT DISTINCT ON (kind) id, kind, payload, created_at
       FROM artifacts WHERE build_id = $1 ORDER BY kind, id DESC`,
    [buildId],
  );

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 16px 80px" }}>
      <nav style={{ marginBottom: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>
          ← Builds
        </Link>
      </nav>

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{build.name}</h1>
        <span className="badge" title="§E3 version_built_against">
          built against V{build.standards_version}
        </span>
      </header>

      <UploadPanel
        buildId={buildId}
        initialAssets={assets.map((a) => ({
          id: a.id, kind: a.kind, filename: a.filename,
          byte_size: Number(a.byte_size), source_url: a.source_url,
        }))}
        initialProcesses={processes.map((p) => ({
          id: p.id, step: p.step, prompt_label: p.prompt_label,
          status: p.status, stage: p.stage, error: p.error,
        }))}
      />

      {artifacts.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <ArtifactList artifacts={artifacts} />
        </div>
      )}
    </main>
  );
}
