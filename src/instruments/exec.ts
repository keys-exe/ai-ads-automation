import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class MissingInstrumentError extends Error {
  constructor(public readonly binary: string) {
    super(
      `Required instrument "${binary}" is not on PATH. §42 Part 1 runs objective instruments before any interpretation — the step cannot fall back to an estimate. Install it and put it on PATH — "npm run ready" lists which are missing.`,
    );
    this.name = "MissingInstrumentError";
  }
}

const availability = new Map<string, boolean>();

export async function requireBinary(binary: string): Promise<void> {
  if (availability.get(binary)) return;
  try {
    await execFileAsync("which", [binary]);
    availability.set(binary, true);
  } catch {
    availability.set(binary, false);
    throw new MissingInstrumentError(binary);
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Run an instrument.
 *
 * ffmpeg writes its filter output (silencedetect, showinfo, signalstats) to
 * stderr and exits non-zero in cases we still want to read, so stderr is
 * returned rather than thrown on, and `maxBuffer` is raised because a
 * per-frame signalstats dump on a 4-minute video is megabytes of text.
 */
export async function run(
  binary: string,
  args: string[],
  options: { timeoutMs?: number; allowFailure?: boolean } = {},
): Promise<RunResult> {
  await requireBinary(binary);
  const { timeoutMs = 10 * 60 * 1000, allowFailure = false } = options;
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 256 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    if (err.killed) throw new Error(`${binary} timed out after ${timeoutMs}ms`);
    if (allowFailure) return { stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
    throw new Error(`${binary} exited ${err.code}: ${(err.stderr ?? "").slice(-600)}`);
  }
}
