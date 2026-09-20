import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listConnections, encryptionConfigured, PROVIDERS, PROVIDER_SPEC } from "@/lib/connections";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const connections = await listConnections();

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 16px 80px" }}>
      <nav style={{ marginBottom: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>
          ← Builds
        </Link>
      </nav>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 0" }}>
          Connect the services the pipeline calls. Secrets are encrypted before they are stored and
          are never sent back to the browser — only the last four characters are shown.
        </p>
      </header>

      <ConnectionsPanel
        initialConnections={connections}
        encryptionConfigured={encryptionConfigured()}
        providers={PROVIDERS.map((p) => ({ id: p, ...PROVIDER_SPEC[p] }))}
      />
    </main>
  );
}
