/**
 * Splitting the chosen take into the parts HeyGen renders.
 *
 * Deterministic on purpose. The split decides where a cut lands in the
 * finished ad, and a model asked to "split this sensibly" gives a different
 * answer each run — which is the §14A "different outfit is not a steerable
 * instruction" problem, applied to structure.
 *
 * Three constraints, in priority order:
 *   1. Never split mid-sentence. §29's single-beat rule means a segment is a
 *      whole thought; a cut inside one reads as a dropped frame.
 *   2. Every segment stays under Eleven v3's 3,000-character ceiling. This is
 *      a hard API gate, not a preference.
 *   3. Segments come out as even as the sentence boundaries allow, because
 *      wildly uneven parts render as wildly uneven shots.
 */

import { V3_CHAR_LIMIT } from "@/providers/elevenlabs";

export interface Segment {
  ordinal: number;
  text: string;
  charCount: number;
  wordCount: number;
  splitReason: string;
}

export interface SplitOptions {
  /** The user's ask is 3–4 parts; both ends are honoured. */
  minParts?: number;
  maxParts?: number;
  charLimit?: number;
}

const TERMINALS = ".!?…";
const CLOSING = /["'”’)\]]/;

/**
 * Split on sentence boundaries.
 *
 * Scanned rather than matched with one regex, because an ellipsis is not
 * reliably a terminator. In ad copy "Then nothing… for three years" is one
 * thought with a pause in it, and treating the ellipsis as an end cuts the
 * sentence in half — the exact failure rule 1 exists to prevent. So an
 * ellipsis closes a sentence only when what follows looks like a new one:
 * end of text, or whitespace then a capital or an opening quote.
 *
 * Full stops, question marks and exclamation marks always close.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let i = 0;

  while (i < text.length) {
    if (!TERMINALS.includes(text[i])) {
      i += 1;
      continue;
    }

    // Consume the whole run of terminal punctuation, then any closing quotes.
    let end = i;
    while (end < text.length && TERMINALS.includes(text[end])) end += 1;
    const run = text.slice(i, end);
    while (end < text.length && CLOSING.test(text[end])) end += 1;

    const isEllipsis = run === "…" || run === "...";
    if (isEllipsis && !startsNewSentence(text, end)) {
      // A pause, not an end. Keep scanning inside the same sentence.
      i = end;
      continue;
    }

    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    i = end;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);

  return sentences;
}

/** True where the text after an ellipsis reads as the start of a new sentence. */
function startsNewSentence(text: string, index: number): boolean {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (i >= text.length) return true; // a trailing ellipsis ends the text
  const next = text[i];
  if (/["'“‘]/.test(next)) return true;
  return /[A-Za-z]/.test(next) && next === next.toUpperCase();
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function splitScript(text: string, options: SplitOptions = {}): Segment[] {
  const { minParts = 3, maxParts = 4, charLimit = V3_CHAR_LIMIT } = options;

  const cleaned = text.trim();
  if (!cleaned) return [];

  const sentences = splitSentences(cleaned);
  if (!sentences.length) return [];

  // A single sentence longer than the ceiling cannot be split on a boundary
  // that exists. Surfacing it beats cutting mid-clause silently.
  const oversized = sentences.find((s) => s.length > charLimit);
  if (oversized) {
    throw new Error(
      `A single sentence is ${oversized.length} characters, over the ${charLimit} ceiling, and cannot be split on a sentence boundary. Shorten it in the script: ${oversized.slice(0, 120)}…`,
    );
  }

  // The ceiling can force more parts than asked for. It wins.
  const forcedByLimit = Math.ceil(cleaned.length / charLimit);
  const parts = Math.max(minParts, Math.min(maxParts, Math.max(minParts, forcedByLimit)), forcedByLimit);

  const grouped = groupEvenly(sentences, parts, charLimit);

  return grouped.map((sentencesInPart, index) => {
    const partText = sentencesInPart.join(" ");
    return {
      ordinal: index + 1,
      text: partText,
      charCount: partText.length,
      wordCount: countWords(partText),
      splitReason:
        forcedByLimit > maxParts
          ? `Eleven v3's ${charLimit}-character ceiling forced ${grouped.length} parts`
          : `Sentence boundary, balancing ${grouped.length} parts`,
    };
  });
}

/**
 * Greedy grouping toward an even character budget, only ever breaking between
 * sentences. Never returns an empty group: a part with no lines would render
 * as a shot with nothing in it.
 */
function groupEvenly(sentences: string[], parts: number, charLimit: number): string[][] {
  if (parts >= sentences.length) {
    // More parts requested than sentences available — one each, and fewer
    // parts than asked for rather than an empty segment.
    return sentences.map((s) => [s]);
  }

  const total = sentences.reduce((sum, s) => sum + s.length + 1, 0);
  const budget = total / parts;

  const groups: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const remainingSentences = sentences.length - i;
    const remainingGroups = parts - groups.length;

    const wouldExceedLimit = currentChars + sentence.length + 1 > charLimit;
    const overBudget = currentChars >= budget;
    // Never strand the closing groups with nothing: if every remaining
    // sentence is needed to fill the remaining groups, close this one now.
    const mustClose = remainingSentences <= remainingGroups - 1;

    if (current.length && remainingGroups > 1 && (wouldExceedLimit || overBudget || mustClose)) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(sentence);
    currentChars += sentence.length + 1;
  }

  if (current.length) groups.push(current);
  return groups;
}
