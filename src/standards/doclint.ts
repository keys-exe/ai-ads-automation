/**
 * E10 doc-lint, as a test suite.
 *
 * Appendix E10 defines a standing §34 step run before any version cut: a list
 * of computed checks, of which "a cut failing lint does not ship." The document
 * describes them as things somebody runs. Here they run on every commit.
 *
 * Only the checks that are computable from the document alone are implemented.
 * The rest of E10 (ledger job ids resolving to beats, manifests matching
 * payloads, the project-instructions byte-match) needs a live build and belongs
 * with the run ledger, not here.
 */

import { loadStandards } from "./registry";
import type { LockedString } from "./parse";

export type LintSeverity = "error" | "warning";

export interface LintFinding {
  check: string;
  severity: LintSeverity;
  subject: string;
  detail: string;
  line?: number;
}

/** A slot token like [SITE] or [BAND-MATERIAL], filled per build from the Product Sheet (E5). */
const SLOT_TOKEN = /\[[A-Z][A-Z0-9 \/-]*\]/;

/**
 * String IDs E10 names as retired. Any survival outside a retirement notice is
 * a lint failure — that list is quoted from the document, not inferred.
 */
const RETIRED_STRING_IDS = [
  "ANAT-MOD1", "ANAT-MOD2", "ANAT-MOD5", "ANAT-MOD6", "ANAT-ARC", "ANAT-COL",
  "ANAT-HOLD", "NEG-FUTILE", "NEG-M2", "NEG-M3", "NEG-M4", "NEG-M5",
];

/** The three-model arsenal (§18A, §44.19). Anything else is a failed generation. */
export const ARSENAL_MODELS = ["nano_banana_pro", "nano_banana_2", "gpt_image_2_5"] as const;
export const RETIRED_MODELS = ["nano_banana_flash", "flare"] as const;

export function lintStandards(): LintFinding[] {
  const std = loadStandards();
  const findings: LintFinding[] = [];

  const add = (
    check: string,
    severity: LintSeverity,
    subject: string,
    detail: string,
    line?: number,
  ) => findings.push({ check, severity, subject, detail, line });

  // --- E10: "every Appendix A string has a count and the count matches its block"
  for (const s of std.strings) {
    const hasSlot = SLOT_TOKEN.test(s.text);

    if (!s.text) {
      add("string-has-block", "error", s.id, "String ID declares no fenced block", s.lineStart);
      continue;
    }

    if (s.declaredCount === null) {
      // A slot-carrying string cannot have a fixed count — its length depends
      // on the Product Sheet fill. Absence of a count there is correct.
      if (!hasSlot) {
        add("string-has-count", "warning", s.id, "No declared character count and no slot token to excuse it", s.lineStart);
      }
      continue;
    }

    if (s.text.length !== s.declaredCount) {
      const delta = s.text.length - s.declaredCount;
      // A counted string carrying a slot has a nominal count: the printed
      // number is the unfilled length, so only exact drift is reportable.
      add(
        "string-count-matches",
        hasSlot ? "warning" : "error",
        s.id,
        `Declared ${s.declaredCount}, block is ${s.text.length} (${delta > 0 ? "+" : ""}${delta})${hasSlot ? " — carries a slot token, count is nominal" : ""}`,
        s.lineStart,
      );
    }
  }

  // --- E10: "no retired string ID survives outside a retirement notice"
  for (const retired of RETIRED_STRING_IDS) {
    const hit = std.strings.find((s) => s.id === retired);
    if (hit) {
      add("no-retired-strings", "error", retired, "Retired string ID is still defined in Appendix A", hit.lineStart);
    }
  }

  // --- E10: "no lock, route or call template names `flare` or `nano_banana_flash`
  //           outside a retirement notice"
  //
  // Matched on backticked identifiers only. The bare word "flare" is ordinary
  // English in the §12A relief library ("a flare of pain"), and matching it
  // there produced a finding on a section that has nothing to do with routing.
  for (const section of std.sections) {
    if (section.level !== 2) continue;
    const lines = section.body.split("\n");
    lines.forEach((line, i) => {
      for (const model of RETIRED_MODELS) {
        const named = new RegExp("`" + model + "`|variant:\\s*[\"']?" + model, "i");
        if (!named.test(line)) continue;
        // E10 scopes this to "no lock, route or call template". Prose that
        // discusses the retired models — §5's alias finding, E1's fail row —
        // is the retirement notice, not a violation of it. Only a line
        // carrying routing syntax can route.
        const routes = /\bmodel:|\bvariant:|generate_image|generate_video|→/.test(line);
        if (!routes) continue;
        if (/retired|retirement|never|fails?|failed|discard|not routed|fallback/i.test(line)) continue;
        add(
          "no-retired-models",
          "error",
          section.id,
          `Routes or locks retired model "${model}": ${line.trim().slice(0, 90)}`,
          section.lineStart + i,
        );
      }
    });
  }

  // --- Duplicate string IDs: benign only where the blocks are byte-identical
  //     (a deliberate cross-listing), a genuine conflict otherwise.
  const byId = new Map<string, LockedString[]>();
  for (const s of std.strings) {
    const list = byId.get(s.id) ?? [];
    list.push(s);
    byId.set(s.id, list);
  }
  for (const [id, copies] of byId) {
    if (copies.length < 2) continue;
    const identical = copies.every((c) => c.text === copies[0].text);
    add(
      "no-conflicting-duplicates",
      identical ? "warning" : "error",
      id,
      identical
        ? `Defined ${copies.length}× with identical text (cross-listed in ${copies.map((c) => c.group).join(", ")})`
        : `Defined ${copies.length}× with DIFFERENT text — ${copies.map((c) => `${c.group} L${c.lineStart} (${c.text.length})`).join(" vs ")}`,
      copies[0].lineStart,
    );
  }

  // --- E10: "§44 numbering is ordered"
  const locked = std.sections.find((s) => s.id === "44");
  if (locked) {
    const numbers = [...locked.body.matchAll(/^\*\*(\d+)\./gm)].map((m) => Number(m[1]));
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] < numbers[i - 1]) {
        add("locked-defaults-ordered", "warning", `§44.${numbers[i]}`, `Out of order: ${numbers[i]} follows ${numbers[i - 1]}`);
      }
    }
  }

  return findings;
}

export function formatFindings(findings: LintFinding[]): string {
  if (!findings.length) return "doc-lint: clean";

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  const byCheck = new Map<string, LintFinding[]>();
  for (const f of findings) {
    const list = byCheck.get(f.check) ?? [];
    list.push(f);
    byCheck.set(f.check, list);
  }

  const lines: string[] = [
    `doc-lint: ${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`,
    "",
  ];
  for (const [check, list] of byCheck) {
    lines.push(`  ${check} (${list.length})`);
    for (const f of list) {
      lines.push(`    ${f.severity === "error" ? "✗" : "!"} ${f.subject.padEnd(18)} ${f.detail}${f.line ? `  (L${f.line})` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
