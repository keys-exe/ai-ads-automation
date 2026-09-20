/**
 * Parser for the Global Standards document.
 *
 * Turns the ~6.6k-line markdown standard into two queryable stores:
 *
 *   1. Sections  — keyed by their section number ("12A", "30C", "42") so a
 *      process can assemble a system prompt from a declared section list
 *      instead of pasting the whole 679KB document into every call.
 *   2. Locked strings — the Appendix A string library (`CAM-LOCK`, `RIG-R3C`,
 *      `NEG-PLACE` ...), each with its declared character count so E10's
 *      doc-lint can verify the count matches the block.
 *
 * The parser is deliberately dumb about meaning. It reads structure only.
 */

export interface StandardsSection {
  /** "12A", "30C", "42", "APPENDIX-A", "BLOCK-1", or a slug for unnumbered headings. */
  id: string;
  /** Heading depth: 1 = BLOCK/APPENDIX, 2 = numbered section, 3 = sub-heading. */
  level: number;
  /** Heading text with markdown emphasis and the leading number stripped. */
  title: string;
  /** The heading line exactly as written. */
  heading: string;
  /** 1-indexed line numbers in the source document. */
  lineStart: number;
  lineEnd: number;
  /** Everything under this heading, up to the next heading of the same or higher level. */
  body: string;
  /** Section ids of the level-3 headings nested under a level-2 section. */
  children: string[];
  /** Marked "measured", "unverified", "locked" in the heading, per the §45 marking rule. */
  status: SectionStatus[];
}

export type SectionStatus = "locked" | "measured" | "unverified" | "retired" | "new" | "amended";

export interface LockedString {
  /** The string ID as referenced by sections, e.g. "CAM-LOCK". */
  id: string;
  /** Prose on the header line: what it is, where it goes, whether it may be trimmed. */
  note: string;
  /** The character count the document declares, e.g. *(363)*. Null where none is printed. */
  declaredCount: number | null;
  /** The fenced block body, verbatim. This is what gets pasted into a prompt. */
  text: string;
  /** Appendix A sub-heading the string lives under, e.g. "Capture", "Rigs", "Negatives". */
  group: string;
  lineStart: number;
  /** True where the header line marks the string as never trimmable. */
  neverTrimmed: boolean;
}

export interface ParsedStandards {
  version: string;
  sections: StandardsSection[];
  strings: LockedString[];
  /** Source byte length, so a mismatched document is caught before a build runs against it. */
  sourceBytes: number;
}

const HEADING = /^(#{1,3})\s+(.*)$/;

/** Strip markdown emphasis, trailing parentheticals and the leading section number. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\*\(.*?\)\*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a stable id from a heading.
 *
 * "## 12A. Mechanism Register"          -> "12A"
 * "## 30C. Scene Consistency Standard"  -> "30C"
 * "### §3A — Narrated B-roll"           -> "3A"
 * "# APPENDIX E — AUTOMATION LAYER"     -> "APPENDIX-E"
 * "# BLOCK 4 — PROCESS"                 -> "BLOCK-4"
 */
function deriveId(title: string, level: number, usedIds: Set<string>): string {
  const appendix = title.match(/^APPENDIX\s+([A-Z])/i);
  if (appendix) return `APPENDIX-${appendix[1].toUpperCase()}`;

  const block = title.match(/^BLOCK\s+(\d+)/i);
  if (block) return `BLOCK-${block[1]}`;

  // "12A. Title" / "42. Title" / "§3A — Title"
  const numbered = title.match(/^§?\s*(\d+[A-Z]?)\s*[.—–-]/);
  if (numbered) {
    const id = numbered[1].toUpperCase();
    if (!usedIds.has(id)) return id;
  }

  const slug = cleanTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  let candidate = slug || `heading-${usedIds.size}`;
  let n = 2;
  while (usedIds.has(candidate)) candidate = `${slug}-${n++}`;
  return candidate;
}

function deriveStatus(heading: string): SectionStatus[] {
  const out = new Set<SectionStatus>();
  const h = heading.toLowerCase();
  if (/\blocked\b/.test(h)) out.add("locked");
  if (/\bmeasured\b/.test(h)) out.add("measured");
  if (/\bunverified\b/.test(h)) out.add("unverified");
  if (/\bretired\b/.test(h)) out.add("retired");
  if (/\bnew\b/.test(h)) out.add("new");
  if (/\bamended\b|\brewritten\b|\brebuilt\b/.test(h)) out.add("amended");
  return [...out];
}

export function parseStandards(source: string): ParsedStandards {
  const lines = source.split("\n");

  const versionMatch = source.match(/\*\*Version\s+([\d.]+)\s*—/);
  const version = versionMatch ? versionMatch[1] : "unknown";

  const sections = parseSections(lines);
  const strings = parseStringLibrary(lines);

  return { version, sections, strings, sourceBytes: Buffer.byteLength(source, "utf8") };
}

function parseSections(lines: string[]): StandardsSection[] {
  interface Open {
    section: StandardsSection;
    bodyStart: number;
  }

  const sections: StandardsSection[] = [];
  const usedIds = new Set<string>();
  const stack: Open[] = [];
  let inFence = false;

  const close = (open: Open, endLine: number) => {
    open.section.lineEnd = endLine;
    open.section.body = lines.slice(open.bodyStart, endLine).join("\n").trim();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings inside fenced blocks are prompt content, not document structure.
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = HEADING.exec(line);
    if (!match) continue;

    const level = match[1].length;
    const rawTitle = match[2].trim();

    while (stack.length && stack[stack.length - 1].section.level >= level) {
      close(stack.pop()!, i);
    }

    const id = deriveId(rawTitle, level, usedIds);
    usedIds.add(id);

    const section: StandardsSection = {
      id,
      level,
      title: cleanTitle(rawTitle),
      heading: rawTitle,
      lineStart: i + 1,
      lineEnd: lines.length,
      body: "",
      children: [],
      status: deriveStatus(rawTitle),
    };

    const parent = stack[stack.length - 1];
    if (parent && level === 3 && parent.section.level === 2) {
      parent.section.children.push(id);
    }

    sections.push(section);
    stack.push({ section, bodyStart: i + 1 });
  }

  while (stack.length) close(stack.pop()!, lines.length);

  return sections;
}

/**
 * Appendix A entries look like:
 *
 *   **`CAP-A`** — Mode 1 capture core. **T2I only** (§37). Never trimmed. *(427)*
 *   ```
 *   Capture must look like a phone camera file, not a lit scene: ...
 *   ```
 *
 * The count in the trailing parenthetical is the document's own claim about
 * the block beneath it. Verifying that claim is E10's first doc-lint check.
 */
const STRING_HEADER = /^\*\*`([A-Z0-9][A-Z0-9_-]*)`\*\*\s*(.*)$/;

function parseStringLibrary(lines: string[]): LockedString[] {
  const appendixA = lines.findIndex((l) => /^#\s+APPENDIX A/i.test(l));
  const appendixB = lines.findIndex((l) => /^#\s+APPENDIX B/i.test(l));
  if (appendixA === -1) return [];
  const end = appendixB === -1 ? lines.length : appendixB;

  const out: LockedString[] = [];
  let group = "";

  for (let i = appendixA; i < end; i++) {
    const line = lines[i];

    const groupMatch = /^##\s+(.*)$/.exec(line);
    if (groupMatch) {
      group = cleanTitle(groupMatch[1]);
      continue;
    }

    const header = STRING_HEADER.exec(line);
    if (!header) continue;

    const [, id, note] = header;

    // The count is the last parenthetical on the header line, e.g. *(806)*.
    const counts = [...note.matchAll(/\*\((\d[\d,]*)\)\*/g)];
    const declaredCount = counts.length
      ? Number(counts[counts.length - 1][1].replace(/,/g, ""))
      : null;

    // Walk forward to the string's fenced block. Stop at the next string
    // header or heading so a string with no block is recorded as empty
    // rather than silently absorbing the next string's text.
    let j = i + 1;
    let text = "";
    while (j < end) {
      const l = lines[j];
      if (STRING_HEADER.test(l) || /^#{1,3}\s/.test(l)) break;
      if (l.startsWith("```")) {
        const buf: string[] = [];
        j++;
        while (j < end && !lines[j].startsWith("```")) buf.push(lines[j++]);
        text = buf.join("\n");
        break;
      }
      j++;
    }

    out.push({
      id,
      note: note.replace(/\*\((\d[\d,]*)\)\*\s*$/, "").trim(),
      declaredCount,
      text,
      group,
      lineStart: i + 1,
      neverTrimmed: /never (?:be )?trimmed|never edited/i.test(note),
    });
  }

  return out;
}

/**
 * The character count a prompt is measured by.
 *
 * §4, measured: Kling's 2,500 ceiling counts newlines — the same clip prompt
 * measured 2,474 minified and was rejected at 2,506 pretty-printed. Every
 * reported count is therefore the length of the minified string.
 */
export function promptLength(text: string): number {
  return text.replace(/\n/g, "").length;
}
