import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { checkReadiness, type ReadinessCheck } from "@/lib/readiness";

export const dynamic = "force-dynamic";

/**
 * "Where am I and what next."
 *
 * Deliberately not the Settings page: Settings is where things are changed,
 * this is where you find out what needs changing. Every failing check carries
 * its own fix so nothing has to be looked up elsewhere.
 */
export default async function SetupPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const readiness = await checkReadiness();
  const blocking = readiness.checks.filter((c) => c.status === "missing" || c.status === "failing");

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 16px 80px" }}>
      <nav style={{ marginBottom: 16, display: "flex", gap: 14 }}>
        <Link href="/" style={navLink}>Builds</Link>
        <Link href="/settings" style={navLink}>Settings</Link>
      </nav>

      <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>Setup</h1>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "0 0 24px" }}>
        Everything the pipeline needs, and what is missing. Each problem carries its own fix.
      </p>

      {readiness.nextAction && (
        <section className="card" style={{
          marginBottom: 24,
          borderColor: blocking.length ? "var(--border-accent)" : "var(--border)",
        }}>
          <div style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Do this next
          </div>
          <p style={{ fontSize: 16, margin: "8px 0 6px" }}>{readiness.nextAction.label}</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            {readiness.nextAction.detail}
          </p>
          <Link href={readiness.nextAction.href} style={primaryLink}>
            {readiness.nextAction.href === "/settings" ? "Open Settings" : "Go to Builds"}
          </Link>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={heading}>What you can run right now</h2>
        <div style={{ display: "grid", gap: 8 }}>
          <Capability
            ready={readiness.canRunSteps12}
            label="Steps 1 and 2 — absorb the video and the script"
            cost="About $0.60 of Anthropic usage. No image or video credits."
            needs="Anthropic"
          />
          <Capability
            ready={readiness.canRunSteps345}
            label="Steps 3, 4 and 5 — cast, locations, act map"
            cost="Anthropic, plus Higgsfield image credits for sheets and plates."
            needs="Anthropic and Higgsfield"
          />
          <Capability
            ready={readiness.canRunVoice}
            label="The voice route — cloned voice and avatar videos"
            cost="ElevenLabs and HeyGen usage. HeyGen is the expensive one, roughly $4–5 per minute of video."
            needs="Anthropic, ElevenLabs and HeyGen"
          />
        </div>
      </section>

      <section>
        <h2 style={heading}>Checklist</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {readiness.checks.map((check) => <CheckRow key={check.id} check={check} />)}
        </div>
      </section>
    </main>
  );
}

function Capability({ ready, label, cost, needs }: {
  ready: boolean; label: string; cost: string; needs: string;
}) {
  return (
    <div className="card" style={{ opacity: ready ? 1 : 0.72 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <span style={{ fontSize: 14.5 }}>{label}</span>
        <span className="badge" data-tone={ready ? "ok" : "warn"}>{ready ? "ready" : "not yet"}</span>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "6px 0 0" }}>{cost}</p>
      {!ready && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 0" }}>Needs {needs}.</p>
      )}
    </div>
  );
}

const TONE: Record<string, { tone: string; word: string }> = {
  ok: { tone: "ok", word: "ready" },
  missing: { tone: "error", word: "missing" },
  failing: { tone: "error", word: "failing" },
  untested: { tone: "warn", word: "untested" },
  optional: { tone: "", word: "optional" },
};

function CheckRow({ check }: { check: ReadinessCheck }) {
  const tone = TONE[check.status] ?? TONE.untested;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{check.label}</span>
        <span className="badge" data-tone={tone.tone || undefined}>{tone.word}</span>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "6px 0 0" }}>{check.why}</p>
      <p style={{ fontSize: 12.5, margin: "6px 0 0", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
        {check.detail}
      </p>

      {check.fix && (
        <div style={{
          marginTop: 10, padding: "8px 10px", background: "var(--surface-1)",
          borderRadius: "var(--radius)", borderLeft: "3px solid var(--border-accent)",
        }}>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            How to fix
          </div>
          <p style={{ fontSize: 13, margin: "4px 0 0" }}>{check.fix}</p>
          {check.href && (
            <Link href={check.href} style={{ ...primaryLink, marginTop: 8, display: "inline-block" }}>
              Open Settings
            </Link>
          )}
        </div>
      )}

      {check.blocks.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--hl-negatives)", margin: "8px 0 0" }}>
          Blocks: {check.blocks.join(" · ")}
        </p>
      )}
    </div>
  );
}

const heading: React.CSSProperties = {
  fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase",
  color: "var(--text-muted)", margin: "0 0 10px",
};

const navLink: React.CSSProperties = {
  fontSize: 13, color: "var(--text-secondary)", textDecoration: "none",
};

const primaryLink: React.CSSProperties = {
  background: "var(--fill-accent)", color: "var(--surface-2)",
  borderRadius: "var(--radius)", padding: "7px 13px", fontSize: 13,
  textDecoration: "none", display: "inline-block",
};
