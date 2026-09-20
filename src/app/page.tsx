import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/db/client";
import { currentUser } from "@/lib/auth";
import { loadStandards } from "@/standards/registry";
import { NewBuildForm } from "@/components/NewBuildForm";

export const dynamic = "force-dynamic";

interface BuildRow extends Record<string, unknown> {
  id: number;
  name: string;
  standards_version: string;
  created_at: string;
  asset_count: string;
  step1_status: string | null;
  step2_status: string | null;
}

export default async function BuildsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const builds = await query<BuildRow>(`
    SELECT b.id, b.name, b.standards_version, b.created_at,
           (SELECT count(*) FROM assets a WHERE a.build_id = b.id) AS asset_count,
           (SELECT status::text FROM processes p WHERE p.build_id = b.id AND p.step = 1 ORDER BY p.id DESC LIMIT 1) AS step1_status,
           (SELECT status::text FROM processes p WHERE p.build_id = b.id AND p.step = 2 ORDER BY p.id DESC LIMIT 1) AS step2_status
      FROM builds b
     ORDER BY b.id DESC
  `);

  const standards = loadStandards();

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 16px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Builds</h1>
        <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span className="badge">
            Standards V{standards.version} · {standards.sections.length} sections · {standards.strings.length} strings
          </span>
          <Link href="/settings" className="badge" style={{ textDecoration: "none" }}>Settings</Link>
        </span>
      </header>

      <NewBuildForm />

      <section style={{ marginTop: 24, display: "grid", gap: 10 }}>
        {builds.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No builds yet. A build starts with the upload bundle — inspo video, script, product,
            Product Sheet, and a product placement reference where the product is worn.
          </p>
        )}
        {builds.map((b) => (
          <Link key={b.id} href={`/build/${b.id}`} className="card" style={{ textDecoration: "none", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 16 }}>{b.name}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <span className="badge">{b.asset_count} assets</span>
                <StepBadge step={1} status={b.step1_status} />
                <StepBadge step={2} status={b.step2_status} />
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
              build {b.id} · built against V{b.standards_version}
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}

function StepBadge({ step, status }: { step: number; status: string | null }) {
  if (!status) return <span className="badge">step {step} not run</span>;
  const tone = status === "done" ? "ok" : status === "failed" ? "error" : status === "running" ? "accent" : "warn";
  return <span className="badge" data-tone={tone}>step {step} {status}</span>;
}
