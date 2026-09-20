/**
 * Scoring a TTS take.
 *
 * §28G makes dead air measurable rather than felt — "first word inside half a
 * second, cut within a beat of the last" — and E1 binds both to silence
 * detection at −40 dB. §22D adds the register. So a take is scored on
 * instruments, not on an impression, and the numbers travel with the
 * shortlist (§45: show the number).
 *
 * The scorer ranks. It does not choose: the standards treat voice quality as a
 * human call, and a number that ranks well can still sound wrong.
 */

import { detectSilence, measureVolume } from "./audio";
import { probe } from "./probe";

/** §28G / E1 thresholds, quoted rather than invented. */
export const ENTRY_LATENCY_MAX_S = 0.5;
export const INTERNAL_GAP_MAX_S = 0.4;

export interface TakeScore {
  durationSeconds: number;
  /** Silence before the first word. E1: reissue with BREATH-A above 0.5s. */
  entryLatencyS: number;
  entryLatencyPass: boolean;
  /** The longest silence between phrases. E1: re-render above 0.4s. */
  longestInternalGapS: number;
  gapPass: boolean;
  /** Trailing silence — §28G's "cut within a beat of the last". Trimmed in post, not a fail. */
  trailingSilenceS: number;
  wordsPerMinute: number;
  loudnessRangeLu: number | null;
  register: string;
  /** 0–100. A ranking aid, never a verdict. */
  score: number;
  notes: string[];
}

export async function scoreTake(audioPath: string, wordCount: number): Promise<TakeScore> {
  const [format, silence, volume] = await Promise.all([
    probe(audioPath),
    detectSilence(audioPath, -40, 0.1),
    measureVolume(audioPath),
  ]);

  const duration = format.durationSeconds;
  const windows = silence.windows;

  // A silence window starting at ~0 is the entry latency; anything else
  // bounded by speech on both sides is an internal gap.
  const leading = windows.find((w) => w.start <= 0.05);
  const entryLatencyS = leading ? Number(leading.end.toFixed(3)) : 0;

  const trailing = windows.find((w) => Math.abs(w.end - duration) <= 0.05);
  const trailingSilenceS = trailing ? Number((duration - trailing.start).toFixed(3)) : 0;

  const internal = windows.filter((w) => w !== leading && w !== trailing);
  const longestInternalGapS = internal.length
    ? Number(Math.max(...internal.map((w) => w.duration)).toFixed(3))
    : 0;

  // Words per minute over SPOKEN time, not wall time: leading and trailing
  // silence would otherwise make a well-paced take read as slow.
  const spoken = Math.max(0.1, duration - entryLatencyS - trailingSilenceS);
  const wordsPerMinute = Number(((wordCount / spoken) * 60).toFixed(1));

  const entryLatencyPass = entryLatencyS <= ENTRY_LATENCY_MAX_S;
  const gapPass = longestInternalGapS <= INTERNAL_GAP_MAX_S;

  const notes: string[] = [];
  if (!entryLatencyPass) notes.push(`Entry latency ${entryLatencyS}s exceeds ${ENTRY_LATENCY_MAX_S}s (§28G) — reissue with BREATH-A.`);
  if (!gapPass) notes.push(`Longest internal gap ${longestInternalGapS}s exceeds ${INTERNAL_GAP_MAX_S}s (E1) — re-render the block.`);
  if (trailingSilenceS > 0.6) notes.push(`${trailingSilenceS}s of trailing silence — trim in post (§28G), not a fail.`);
  if (wordsPerMinute < 110) notes.push(`${wordsPerMinute} wpm reads slow for direct response.`);
  if (wordsPerMinute > 200) notes.push(`${wordsPerMinute} wpm reads rushed.`);

  return {
    durationSeconds: Number(duration.toFixed(3)),
    entryLatencyS, entryLatencyPass,
    longestInternalGapS, gapPass,
    trailingSilenceS,
    wordsPerMinute,
    loudnessRangeLu: volume.loudnessRangeLu,
    register: volume.register,
    score: computeScore({ entryLatencyS, longestInternalGapS, wordsPerMinute, trailingSilenceS }),
    notes,
  };
}

/**
 * A blunt 0–100 ranking aid.
 *
 * The two §28G gates dominate because they are the two the standards actually
 * bind to a threshold; pace is a softer penalty because its comfortable band
 * is wide and register-dependent.
 */
function computeScore(input: {
  entryLatencyS: number;
  longestInternalGapS: number;
  wordsPerMinute: number;
  trailingSilenceS: number;
}): number {
  let score = 100;

  if (input.entryLatencyS > ENTRY_LATENCY_MAX_S) {
    score -= Math.min(40, 20 + (input.entryLatencyS - ENTRY_LATENCY_MAX_S) * 20);
  }
  if (input.longestInternalGapS > INTERNAL_GAP_MAX_S) {
    score -= Math.min(35, 15 + (input.longestInternalGapS - INTERNAL_GAP_MAX_S) * 25);
  }

  // Comfortable direct-response pace sits roughly 130–180 wpm; drift outside
  // costs a little, not a lot.
  if (input.wordsPerMinute < 130) score -= Math.min(15, (130 - input.wordsPerMinute) * 0.3);
  if (input.wordsPerMinute > 180) score -= Math.min(15, (input.wordsPerMinute - 180) * 0.3);

  if (input.trailingSilenceS > 0.6) score -= 3; // a post trim, barely a cost

  return Math.max(0, Math.round(score));
}

/** Rank takes best-first. Ties break toward the lower entry latency. */
export function rankTakes<T extends { score: TakeScore }>(takes: T[]): T[] {
  return [...takes].sort((a, b) => {
    if (b.score.score !== a.score.score) return b.score.score - a.score.score;
    return a.score.entryLatencyS - b.score.entryLatencyS;
  });
}
