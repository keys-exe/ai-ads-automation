import { NextResponse } from "next/server";
import { query } from "@/db/client";
import { loadStandards } from "@/standards/registry";
import { encryptionConfigured } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness in one.
 *
 * Reports the three things that silently break a deployment: the database
 * being unreachable, the standards document missing from the image (the app
 * reads it from disk at runtime), and the encryption key being unset — which
 * does not crash anything but makes Settings refuse every save.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    await query("SELECT 1");
    checks.database = { ok: true, detail: "reachable" };
  } catch (error) {
    checks.database = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  try {
    const standards = loadStandards();
    checks.standards = {
      ok: standards.sections.length > 0,
      detail: `V${standards.version} · ${standards.sections.length} sections · ${standards.strings.length} strings`,
    };
  } catch (error) {
    checks.standards = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  checks.encryption = encryptionConfigured()
    ? { ok: true, detail: "SETTINGS_ENCRYPTION_KEY is set" }
    : { ok: false, detail: "SETTINGS_ENCRYPTION_KEY is not set — Settings cannot store credentials" };

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
