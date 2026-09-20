/**
 * The queryable view over the parsed Standards.
 *
 * A process never receives the whole document. It declares the sections it
 * needs and the registry assembles exactly those, in document order, into a
 * cacheable system-prompt prefix. Two reasons, and the second is the real one:
 * a 679KB paste is expensive, and a model given every rule in the corpus
 * applies the wrong ones.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStandards, type LockedString, type ParsedStandards, type StandardsSection } from "./parse";

let cached: ParsedStandards | null = null;

/** The standards document that ships with this build of the app. */
export const STANDARDS_FILE = "V7.51.3.md";

export function loadStandards(): ParsedStandards {
  if (cached) return cached;
  const path = join(process.cwd(), "standards", STANDARDS_FILE);
  cached = parseStandards(readFileSync(path, "utf8"));
  return cached;
}

export function getSection(id: string): StandardsSection | undefined {
  return loadStandards().sections.find((s) => s.id === id.toUpperCase());
}

export function getString(id: string): LockedString | undefined {
  return loadStandards().strings.find((s) => s.id === id.toUpperCase());
}

export function allStrings(): LockedString[] {
  // RIG-R7 is cross-listed under both "Fixed mount" and "Rigs" with identical
  // text. Dedupe by id so a consumer never has to know that.
  const seen = new Set<string>();
  return loadStandards().strings.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export class MissingSectionError extends Error {
  constructor(public readonly ids: string[]) {
    super(`Standards sections not found: ${ids.join(", ")}`);
    this.name = "MissingSectionError";
  }
}

/**
 * Assemble a system-prompt fragment from a declared section list.
 *
 * Sections come back in document order regardless of the order requested, so
 * the assembled string is a pure function of the set. That determinism is what
 * makes the prefix cacheable — a set that reorders per call never hits cache.
 */
export function assembleContext(sectionIds: string[]): string {
  const std = loadStandards();
  const want = new Set(sectionIds.map((id) => id.toUpperCase()));

  const missing = [...want].filter((id) => !std.sections.some((s) => s.id === id));
  if (missing.length) throw new MissingSectionError(missing);

  return std.sections
    .filter((s) => want.has(s.id))
    .map((s) => `${"#".repeat(s.level)} ${s.heading}\n\n${s.body}`)
    .join("\n\n---\n\n");
}

/**
 * Resolve every `ID` reference in a piece of assembled context to its
 * Appendix A block, so a process that is told to use `CAM-LOCK` can also read
 * what `CAM-LOCK` says without being handed all 239 strings.
 */
export function resolveReferencedStrings(context: string): LockedString[] {
  const ids = new Set<string>();
  for (const m of context.matchAll(/`([A-Z][A-Z0-9_-]{2,})`/g)) ids.add(m[1]);
  return allStrings().filter((s) => ids.has(s.id));
}

export function renderStringLibrary(strings: LockedString[]): string {
  if (!strings.length) return "";
  return strings
    .map((s) => `**\`${s.id}\`** — ${s.note}\n\`\`\`\n${s.text}\n\`\`\``)
    .join("\n\n");
}
