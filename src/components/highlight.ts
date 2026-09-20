/**
 * §16A — "Highlighting is applied by rule, never by hand."
 *
 * "The colour pass runs over the raw prompt text at render time, as a function
 * of the string. Hand-marked headers survive ten beats and fail at a hundred."
 *
 * Two registers, two algorithms, both quoted from the standard:
 *
 *   Prose — split at `NEGATIVES:`, red to the end and excluded from the caps
 *   pass; then caps runs of two or more words to amber across the remainder.
 *
 *   JSON — tokenised, never regex-painted whole. A quoted token followed by `:`
 *   is a key; any other quoted token is a value; everything between is
 *   structural. Inside a value: caps runs, then 'exact words'. The `negatives`
 *   value takes red in place of teal.
 *
 * "Escape before colouring, never after." Every branch below escapes the raw
 * string first and only then inserts spans.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * §16A's working expression for a caps run: two or more consecutive fully
 * capitalised words. Single all-caps words are left alone — `CAPTURE` on its
 * own stays neutral, `THE ONE THING THAT HAPPENS` goes amber. Sentence-initial
 * capitals never trigger it, because the second character of `The` is lowercase.
 */
const CAPS_RUN = /\b[A-Z][A-Z0-9'’-]*(?:\s+[A-Z][A-Z0-9'’-]*)+\b/g;

/** Quoted 'exact words' — the §28B landing triggers, §28F closure and §28A stress words. */
const EXACT_WORDS = /&#39;[^&]*?&#39;|'[^']*?'/g;

function paintCapsRuns(escaped: string): string {
  return escaped.replace(CAPS_RUN, (match) => `<span class="hl-caps">${match}</span>`);
}

/** Prose prompts — two passes, in this order. */
export function highlightProse(raw: string): string {
  const marker = raw.indexOf("NEGATIVES:");

  if (marker === -1) return paintCapsRuns(escapeHtml(raw));

  // Everything from the token to the end takes red and is excluded from the
  // caps pass, so a negatives line never renders amber.
  const head = escapeHtml(raw.slice(0, marker));
  const tail = escapeHtml(raw.slice(marker));

  return `${paintCapsRuns(head)}<span class="hl-negatives">${tail}</span>`;
}

const JSON_TOKEN = /"(?:[^"\\]|\\.)*"/g;

/** JSON prompts — walked token by token, never painted whole. */
export function highlightJson(raw: string): string {
  let out = "";
  let cursor = 0;

  for (const match of raw.matchAll(JSON_TOKEN)) {
    const start = match.index!;
    const token = match[0];

    // Structural text between tokens takes grey.
    if (start > cursor) {
      out += `<span class="hl-punct">${escapeHtml(raw.slice(cursor, start))}</span>`;
    }

    // A quoted token followed by `:` is a key.
    const after = raw.slice(start + token.length);
    const isKey = /^\s*:/.test(after);

    if (isKey) {
      out += `<span class="hl-key">${escapeHtml(token)}</span>`;
      // Remember the key so the `negatives` value can be recoloured below.
      lastKey = token.slice(1, -1);
    } else {
      const escaped = escapeHtml(token);
      // The value of the `negatives` key takes red in place of teal — the same
      // signal the prose NEGATIVES: line carries, so the eye finds the
      // negatives at identical cost in both registers.
      const cls = lastKey === "negatives" ? "hl-negatives" : "hl-value";
      out += `<span class="${cls}">${paintExactWords(paintCapsRuns(escaped))}</span>`;
      lastKey = null;
    }

    cursor = start + token.length;
  }

  if (cursor < raw.length) {
    out += `<span class="hl-punct">${escapeHtml(raw.slice(cursor))}</span>`;
  }

  lastKey = null;
  return out;
}

// Module-scoped because the key/value pairing is a property of the walk, not
// of any one token. Reset at the start and end of every JSON pass.
let lastKey: string | null = null;

function paintExactWords(escaped: string): string {
  return escaped.replace(EXACT_WORDS, (m) => `<span class="hl-exact">${m}</span>`);
}

export function highlight(raw: string, register: "prose" | "json"): string {
  lastKey = null;
  return register === "json" ? highlightJson(raw) : highlightProse(raw);
}

/**
 * §16A — "Counts are computed at render, never typed."
 *
 * The number on the params line is the length of the exact string the copy
 * button is holding. §4 measured that Kling's ceiling counts newlines, so the
 * reported count is the minified length.
 */
export function promptCharCount(raw: string): number {
  return raw.replace(/\n/g, "").length;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}
