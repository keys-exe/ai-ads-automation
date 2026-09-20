/**
 * "Am I ready, and what do I do next?"
 *
 * The pipeline has five providers, a database, an encryption key and a storage
 * driver, and until now the only way to know whether they were all in place
 * was to run something and read the failure. This computes the answer up
 * front, in plain language, with the fix attached to each problem.
 *
 * Every check states what it BLOCKS rather than just whether it passes,
 * because "Anthropic is not connected" means nothing to someone who does not
 * know that Anthropic is what runs every step.
 */

import { query } from "@/db/client";
import { encryptionConfigured } from "./crypto";
import { listConnections, resolveConnection, PROVIDER_SPEC, type Provider } from "./connections";
import { loadStandards } from "@/standards/registry";
import { storage } from "./storage";

export type CheckStatus = "ok" | "missing" | "failing" | "untested" | "optional";

export interface ReadinessCheck {
  id: string;
  label: string;
  /** Why this exists, for someone who has never seen it before. */
  why: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it, in one instruction. */
  fix: string | null;
  /** Where to go to do it. */
  href: string | null;
  /** What cannot run until this is fixed. Empty where nothing is blocked. */
  blocks: string[];
}

export interface Readiness {
  checks: ReadinessCheck[];
  /** The first thing they should do, or null when everything is ready. */
  nextAction: { label: string; href: string; detail: string } | null;
  canRunSteps12: boolean;
  canRunSteps345: boolean;
  canRunVoice: boolean;
}

/** What each provider unblocks, in the user's terms rather than the code's. */
const PROVIDER_BLOCKS: Record<Provider, string[]> = {
  anthropic: ["Every step — 1, 2, 3, 4 and 5", "The voice route's script cleaning"],
  higgsfield: ["Step 3 — reference sheets", "Step 4 — property and location plates"],
  elevenlabs: ["The voice route — voice clone and speech"],
  heygen: ["The voice route — avatar renders"],
  kling: [],
};

const PROVIDER_REQUIRED: Record<Provider, boolean> = {
  anthropic: true,
  higgsfield: true,
  elevenlabs: false,
  heygen: false,
  // Its adapter has no callers yet: the voice route takes uploaded clips and
  // the video beats step is not built. Connecting it now is harmless.
  kling: false,
};

export async function checkReadiness(): Promise<Readiness> {
  const checks: ReadinessCheck[] = [];

  // --- Infrastructure ------------------------------------------------
  try {
    await query("SELECT 1");
    checks.push({
      id: "database", label: "Database", why: "Stores your builds, uploads and every result.",
      status: "ok", detail: "Connected.", fix: null, href: null, blocks: [],
    });
  } catch (error) {
    checks.push({
      id: "database", label: "Database", why: "Stores your builds, uploads and every result.",
      status: "missing",
      detail: error instanceof Error ? error.message : String(error),
      fix: "Check DATABASE_URL is set and the Postgres service is running.",
      href: null,
      blocks: ["Everything"],
    });
  }

  checks.push(
    encryptionConfigured()
      ? {
          id: "encryption", label: "Credential encryption", status: "ok",
          why: "Scrambles your API keys before they are saved, so a database leak does not hand them over.",
          detail: "Key is set.", fix: null, href: null, blocks: [],
        }
      : {
          id: "encryption", label: "Credential encryption", status: "missing",
          why: "Scrambles your API keys before they are saved, so a database leak does not hand them over.",
          detail: "No key is set, so Settings will refuse to save any connection.",
          fix: "Set SETTINGS_ENCRYPTION_KEY on both the web and worker services. Generate one with: openssl rand -base64 32",
          href: null,
          blocks: ["Connecting any provider"],
        },
  );

  const driver = storage().kind;
  checks.push({
    id: "storage", label: "File storage", status: "ok",
    why: "Holds your uploads so the worker can read them back.",
    detail: driver === "s3"
      ? "Object storage (S3-compatible). Correct for web and worker on separate hosts."
      : "Local disk. Correct only if the web app and worker share a volume — on Railway they cannot, so this needs S3_BUCKET.",
    fix: driver === "filesystem"
      ? "On Railway, set S3_BUCKET and its keys. Railway cannot share a disk between two services."
      : null,
    href: null,
    blocks: [],
  });

  try {
    const standards = loadStandards();
    checks.push({
      id: "standards", label: "Standards document", status: "ok",
      why: "The rulebook every step is built from.",
      detail: `V${standards.version} · ${standards.sections.length} sections · ${standards.strings.length} locked strings.`,
      fix: null, href: null, blocks: [],
    });
  } catch (error) {
    checks.push({
      id: "standards", label: "Standards document", status: "missing",
      why: "The rulebook every step is built from.",
      detail: error instanceof Error ? error.message : String(error),
      fix: "The standards file is missing from the deployment. Redeploy.",
      href: null, blocks: ["Everything"],
    });
  }

  // --- Providers -----------------------------------------------------
  const connections = await listConnections();

  for (const provider of Object.keys(PROVIDER_SPEC) as Provider[]) {
    const spec = PROVIDER_SPEC[provider];
    const stored = connections.find((c) => c.provider === provider && c.isActive);
    const required = PROVIDER_REQUIRED[provider];

    // A provider can be configured two ways, and both work. Looking only at
    // the database was a bug: a key set as an environment variable is used by
    // the pipeline but showed here as "missing", telling someone who had done
    // the right thing that they had not.
    const resolved = await resolveConnection(provider).catch(() => null);

    let status: CheckStatus;
    let detail: string;
    let fix: string | null = null;

    if (!resolved) {
      status = required ? "missing" : "optional";
      detail = required ? "Not connected." : "Not connected. Only needed for the parts listed below.";
      fix = `Connect ${spec.label} in Settings, or set ${spec.envFallback[0]} on both the web and worker services.`;
    } else if (resolved.source === "env") {
      // Env-configured providers carry no test record, because there is no row
      // to record one against. Saying so is better than implying it passed.
      status = "ok";
      detail = `Configured by environment variable. Set it on BOTH the web and worker services — the worker is what runs the steps.`;
    } else if (stored?.testStatus === "ok") {
      status = "ok";
      detail = stored.testDetail ?? "Connected and tested.";
    } else if (stored?.testStatus === "failed") {
      status = "failing";
      detail = stored.testDetail ?? "The last test failed.";
      fix = "The key is saved but the test failed. The message above says why — check the key in Settings.";
    } else {
      status = "untested";
      detail = "Saved, but never tested. Press Test in Settings to confirm it works.";
      fix = "Press Test in Settings. It is a free, read-only call.";
    }

    checks.push({
      id: `provider:${provider}`,
      label: spec.label,
      why: spec.purpose,
      status,
      detail,
      fix,
      href: "/settings",
      blocks: status === "ok" ? [] : PROVIDER_BLOCKS[provider],
    });
  }

  // --- What can actually run ------------------------------------------
  const ok = (id: string) => checks.find((c) => c.id === id)?.status === "ok";

  const canRunSteps12 = ok("database") && ok("standards") && ok("provider:anthropic");
  const canRunSteps345 = canRunSteps12 && ok("provider:higgsfield");
  const canRunVoice = canRunSteps12 && ok("provider:elevenlabs") && ok("provider:heygen");

  return { checks, nextAction: firstAction(checks, canRunSteps12), canRunSteps12, canRunSteps345, canRunVoice };
}

/**
 * The single next thing to do.
 *
 * Ordered by what unblocks the most: infrastructure first, then the provider
 * every step needs, then the ones that only gate part of the pipeline.
 */
function firstAction(checks: ReadinessCheck[], canRunSteps12: boolean): Readiness["nextAction"] {
  const order = [
    "database", "encryption", "standards",
    "provider:anthropic", "provider:higgsfield",
    "provider:elevenlabs", "provider:heygen",
  ];

  for (const id of order) {
    const check = checks.find((c) => c.id === id);
    if (!check || check.status === "ok" || check.status === "optional") continue;
    return {
      label: check.fix ?? `Fix ${check.label}`,
      href: check.href ?? "/settings",
      detail: `${check.label}: ${check.detail}`,
    };
  }

  if (canRunSteps12) {
    return {
      label: "Create a build and run steps 1 and 2",
      href: "/",
      detail: "These use only Anthropic and the local tools — they spend no image or video credits.",
    };
  }

  return null;
}
