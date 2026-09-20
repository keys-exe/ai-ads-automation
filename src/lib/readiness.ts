/**
 * "Am I ready, and what do I do next?"
 *
 * The pipeline needs credentials, the Standards document and three command-line
 * instruments, and the only way to know whether they were all in place used to
 * be to run something and read the failure. This computes the answer up front,
 * in plain language, with the fix attached to each problem.
 *
 * Every check states what it BLOCKS rather than just whether it passes, because
 * "Anthropic is not connected" means nothing to someone who does not know that
 * Anthropic is what runs every step.
 */

import { resolveConnection, PROVIDER_SPEC, type Provider } from "./connections";
import { loadStandards } from "@/standards/registry";
import { run } from "@/instruments/exec";

export type CheckStatus = "ok" | "missing" | "failing" | "optional";

export interface ReadinessCheck {
  id: string;
  label: string;
  /** Why this exists, for someone who has never seen it before. */
  why: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it, in one instruction. */
  fix: string | null;
  /** What cannot run until this is fixed. Empty where nothing is blocked. */
  blocks: string[];
}

export interface Readiness {
  checks: ReadinessCheck[];
  /** The first thing to do, or null when everything is ready. */
  nextAction: { label: string; detail: string } | null;
  canRunStep1: boolean;
  canRunStep2: boolean;
  canRunSteps345: boolean;
}

/** What each provider unblocks, in the operator's terms rather than the code's. */
const PROVIDER_BLOCKS: Record<Provider, string[]> = {
  anthropic: ["Every step — 1, 2, 3, 4 and 5"],
  higgsfield: ["Step 3 — reference sheets", "Step 4 — property and location plates"],
  elevenlabs: ["The voice route — voice clone and speech (not yet wired)"],
  heygen: ["The voice route — avatar renders (not yet wired)"],
  kling: ["The I2V route for beats (not yet wired)"],
};

const PROVIDER_REQUIRED: Record<Provider, boolean> = {
  anthropic: true,
  higgsfield: true,
  // The voice and I2V routes are Phase 2 — their adapters are in the tree and
  // have no callers yet, so a missing key here blocks nothing today.
  elevenlabs: false,
  heygen: false,
  kling: false,
};

/**
 * §42 Part 1's instruments. Step 1 fails immediately with a named missing
 * instrument rather than silently falling back to an estimate — "a label is not
 * a measurement" — so knowing up front which one is absent is worth a check.
 */
const INSTRUMENTS: Array<{ binary: string; why: string; blocks: string[] }> = [
  {
    binary: "ffprobe",
    why: "Reads the inspo video's duration, aspect and resolution — the §3 format lock's inputs.",
    blocks: ["Step 1 — absorb the inspo video"],
  },
  {
    binary: "ffmpeg",
    why: "Scene detection, silence detection, volume and luminance — most of the §42 Part 1 table.",
    blocks: ["Step 1 — absorb the inspo video"],
  },
  {
    binary: "tesseract",
    why: "OCRs text overlays, so the build knows which type is post (§17) rather than rendered.",
    blocks: ["Step 1 — the text-overlay inventory"],
  },
  {
    binary: "whisper",
    why: "Transcribes the reference, which is §42 Part 4's script-absorption input.",
    blocks: ["Step 1 — script absorption from the reference"],
  },
];

export async function checkReadiness(): Promise<Readiness> {
  const checks: ReadinessCheck[] = [];

  for (const provider of Object.keys(PROVIDER_SPEC) as Provider[]) {
    const spec = PROVIDER_SPEC[provider];
    const resolved = await resolveConnection(provider);
    const required = PROVIDER_REQUIRED[provider];

    checks.push({
      id: `provider:${provider}`,
      label: spec.label,
      why: spec.purpose,
      status: resolved ? "ok" : required ? "missing" : "optional",
      detail: resolved
        ? `Configured from ${spec.envFallback[0]}.`
        : `No credential found.`,
      fix: resolved ? null : `Set ${spec.envFallback.join(" or ")} in your environment or .env.`,
      blocks: resolved ? [] : PROVIDER_BLOCKS[provider],
    });
  }

  checks.push(await standardsCheck());

  for (const instrument of INSTRUMENTS) {
    checks.push(await instrumentCheck(instrument));
  }

  const ok = (id: string) => checks.find((check) => check.id === id)?.status === "ok";
  const instrumentsOk = INSTRUMENTS.every((i) => ok(`instrument:${i.binary}`));

  const blocking = checks.find((check) => check.status === "missing" || check.status === "failing");

  return {
    checks,
    nextAction: blocking
      ? { label: `Fix: ${blocking.label}`, detail: blocking.fix ?? blocking.detail }
      : null,
    canRunStep1: ok("provider:anthropic") && ok("standards") && instrumentsOk,
    canRunStep2: ok("provider:anthropic") && ok("standards"),
    canRunSteps345: ok("provider:anthropic") && ok("provider:higgsfield") && ok("standards"),
  };
}

async function standardsCheck(): Promise<ReadinessCheck> {
  try {
    const standards = await loadStandards();
    return {
      id: "standards",
      label: "Standards document",
      why: "Every step assembles its system prompt from a declared list of this document's sections.",
      status: "ok",
      detail: `V${standards.version} — ${standards.sections.length} sections, ${standards.strings.length} locked strings.`,
      fix: null,
      blocks: [],
    };
  } catch (error) {
    return {
      id: "standards",
      label: "Standards document",
      why: "Every step assembles its system prompt from a declared list of this document's sections.",
      status: "failing",
      detail: (error as Error).message,
      fix: "Check that standards/V7.51.3.md is present and readable.",
      blocks: ["Every step"],
    };
  }
}

async function instrumentCheck(
  instrument: (typeof INSTRUMENTS)[number],
): Promise<ReadinessCheck> {
  const base: Omit<ReadinessCheck, "status" | "detail" | "fix" | "blocks"> = {
    id: `instrument:${instrument.binary}`,
    label: instrument.binary,
    why: instrument.why,
  };

  try {
    const result = await run(instrument.binary, ["--version"], { timeoutMs: 10_000 });
    const firstLine = (result.stdout || result.stderr).split("\n")[0]?.trim();
    return {
      ...base,
      status: "ok",
      detail: firstLine || "present",
      fix: null,
      blocks: [],
    };
  } catch {
    return {
      ...base,
      status: "missing",
      detail: `${instrument.binary} is not on PATH.`,
      fix: `Install ${instrument.binary} and make sure it is on PATH.`,
      blocks: instrument.blocks,
    };
  }
}
