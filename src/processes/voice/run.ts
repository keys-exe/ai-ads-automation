/**
 * The voice + avatar route, end to end.
 *
 *   source clips ──┬── audio ──▶ ElevenLabs IVC ──▶ cloned voice
 *                  └── video ──▶ HeyGen Avatar V identity
 *   script ──▶ cleaned ──▶ N takes ──▶ scored ──▶ [you choose] ──▶ split ──▶ rendered
 *
 * One human gate, at take selection. Everything either side runs unattended.
 * The gate is there because voice quality is the kind of judgement a number
 * can rank but not settle, and because every render downstream inherits it.
 *
 * The two source clips do double duty by design: ElevenLabs needs their audio
 * and Avatar V needs their video, so one generation serves both.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { one, query } from "@/db/client";
import { requireConnection } from "@/lib/connections";
import { buildDir, resolveStoragePath } from "@/lib/storage";
import { extractAudio } from "@/instruments/extract";
import { scoreTake, rankTakes, type TakeScore } from "@/instruments/take-score";
import { cleanScript } from "./clean-script";
import { splitScript, countWords } from "./split";
import { createInstantVoiceClone, textToSpeech, ELEVEN_V3 } from "@/providers/elevenlabs";
import { uploadAsset, generateAvatarVideo, waitForVideo } from "@/providers/heygen";

/** How many takes to synthesise before ranking. */
export const TAKE_COUNT = Number(process.env.TTS_TAKE_COUNT ?? 3);

interface RunRow extends Record<string, unknown> {
  id: number;
  build_id: number;
  character_id: string | null;
}

async function setStage(runId: number, stage: string): Promise<void> {
  await query(`UPDATE voice_runs SET stage = $2 WHERE id = $1`, [runId, stage]);
}

async function failRun(runId: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await query(
    `UPDATE voice_runs SET status = 'failed', stage = 'failed', error = $2, finished_at = now() WHERE id = $1`,
    [runId, message.slice(0, 4000)],
  );
}

/* ------------------------------------------------------------------ *
 * Phase 1 — clips to voice, script to scored takes. Ends at the gate.
 * ------------------------------------------------------------------ */

export async function runVoicePhase(runId: number): Promise<void> {
  const run = await one<RunRow>(
    `UPDATE voice_runs SET status = 'running', stage = 'starting', error = NULL
      WHERE id = $1 AND status = 'queued' RETURNING *`,
    [runId],
  );
  if (!run) return;

  try {
    const elevenlabs = await requireConnection("elevenlabs");
    if (!("apiKey" in elevenlabs.secret)) throw new Error("The ElevenLabs connection carries no API key.");
    const apiKey = elevenlabs.secret.apiKey;

    // --- Extract audio. ElevenLabs IVC takes audio samples, not video, so
    //     this is a precondition rather than a convenience.
    await setStage(runId, "extracting-audio");
    const clips = await query<{ id: number; ordinal: number; video_path: string; audio_path: string | null }>(
      `SELECT id, ordinal, video_path, audio_path FROM source_clips
        WHERE run_id = $1 AND video_path IS NOT NULL ORDER BY ordinal`,
      [runId],
    );
    if (!clips.length) throw new Error("No source clips on this run. Generate or upload the clips first.");

    for (const clip of clips) {
      if (clip.audio_path) continue;
      const outputPath = join(buildDir(run.build_id), "voice", `clip-${clip.ordinal}.mp3`);
      const extracted = await extractAudio(resolveStoragePath(clip.video_path), outputPath);
      await query(
        `UPDATE source_clips SET audio_path = $2, duration_s = $3, status = 'ready' WHERE id = $1`,
        [clip.id, outputPath, extracted.durationSeconds],
      );
      clip.audio_path = outputPath;
    }

    // --- Clone the voice from those tracks.
    await setStage(runId, "cloning-voice");
    const samples = await Promise.all(
      clips.map(async (clip) => ({
        filename: `clip-${clip.ordinal}.mp3`,
        data: await readFile(clip.audio_path!),
      })),
    );

    const voiceName = `${run.character_id ?? "presenter"}-build-${run.build_id}`;
    const cloned = await createInstantVoiceClone(apiKey, voiceName, samples, {
      description: `Cloned from ${samples.length} source clips for build ${run.build_id}.`,
    });

    await query(
      `INSERT INTO cloned_voices (run_id, build_id, character_id, provider_voice_id, name, sample_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,'ready')`,
      [runId, run.build_id, run.character_id, cloned.voiceId, voiceName, samples.length],
    );

    // --- Reduce the script to what is spoken.
    await setStage(runId, "cleaning-script");
    const scriptAsset = await one<{ text_content: string | null; storage_path: string }>(
      `SELECT text_content, storage_path FROM assets WHERE build_id = $1 AND kind = 'script' LIMIT 1`,
      [run.build_id],
    );
    if (!scriptAsset) throw new Error("No script in this build's bundle.");

    const rawScript = scriptAsset.text_content
      ?? (await readFile(resolveStoragePath(scriptAsset.storage_path), "utf8"));

    const spoken = await cleanScript(rawScript, (s) => void setStage(runId, s));

    await query(
      `INSERT INTO spoken_scripts (run_id, text, char_count, word_count, removed)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [runId, spoken.text, spoken.text.length, countWords(spoken.text), JSON.stringify(spoken.removed)],
    );

    // --- Synthesise several takes and score each on instruments.
    await setStage(runId, "synthesising");
    const scored: Array<{ ordinal: number; score: TakeScore }> = [];

    for (let i = 0; i < TAKE_COUNT; i++) {
      await setStage(runId, `synthesising take ${i + 1}/${TAKE_COUNT}`);

      // The seed is what makes the takes differ without the text differing.
      const audio = await textToSpeech(apiKey, cloned.voiceId, spoken.text, {
        modelId: ELEVEN_V3,
        seed: 1000 + i,
      });

      const audioPath = join(buildDir(run.build_id), "voice", `take-${i + 1}.mp3`);
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(audioPath), { recursive: true });
      await writeFile(audioPath, audio);

      const score = await scoreTake(audioPath, countWords(spoken.text));
      scored.push({ ordinal: i + 1, score });

      await query(
        `INSERT INTO tts_takes (run_id, ordinal, model, audio_path, duration_s, scores, status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,'ready')`,
        [runId, i + 1, ELEVEN_V3, audioPath, score.durationSeconds, JSON.stringify(score)],
      );
    }

    // Rank, but do not select. §45 puts the numbers on the deliverable; the
    // choice is the operator's.
    const ranked = rankTakes(scored);
    for (const [index, take] of ranked.entries()) {
      await query(`UPDATE tts_takes SET rank = $3 WHERE run_id = $1 AND ordinal = $2`, [
        runId, take.ordinal, index + 1,
      ]);
    }

    await query(
      `UPDATE voice_runs SET status = 'awaiting_selection', stage = 'awaiting_selection' WHERE id = $1`,
      [runId],
    );
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Phase 2 — the chosen take, split and rendered. Runs after the gate.
 * ------------------------------------------------------------------ */

export async function runAvatarPhase(runId: number): Promise<void> {
  const run = await one<RunRow>(
    `UPDATE voice_runs SET status = 'running', stage = 'splitting', error = NULL
      WHERE id = $1 AND status = 'selected' RETURNING *`,
    [runId],
  );
  if (!run) return;

  try {
    const heygen = await requireConnection("heygen");
    if (!("apiKey" in heygen.secret)) throw new Error("The HeyGen connection carries no API key.");
    const apiKey = heygen.secret.apiKey;

    const take = await one<{ id: number; audio_path: string }>(
      `SELECT id, audio_path FROM tts_takes WHERE run_id = $1 AND selected LIMIT 1`, [runId],
    );
    if (!take?.audio_path) throw new Error("No take selected. Choose one before rendering.");

    const spoken = await one<{ text: string }>(
      `SELECT text FROM spoken_scripts WHERE run_id = $1 ORDER BY id DESC LIMIT 1`, [runId],
    );
    if (!spoken) throw new Error("No cleaned script on this run.");

    // --- Split. Deterministic, sentence-bounded, ceiling-aware.
    const segments = splitScript(spoken.text);
    await query(`DELETE FROM script_segments WHERE run_id = $1`, [runId]);
    for (const segment of segments) {
      await query(
        `INSERT INTO script_segments (run_id, ordinal, text, char_count, word_count, split_reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [runId, segment.ordinal, segment.text, segment.charCount, segment.wordCount, segment.splitReason],
      );
    }

    // --- Upload the identity source and the audio once, reuse per segment.
    await setStage(runId, "uploading-assets");
    const identityClip = await one<{ video_path: string }>(
      `SELECT video_path FROM source_clips WHERE run_id = $1 AND video_path IS NOT NULL ORDER BY ordinal LIMIT 1`,
      [runId],
    );
    if (!identityClip) throw new Error("No source clip to learn the avatar identity from.");

    const identityAsset = await uploadAsset(
      apiKey, await readFile(resolveStoragePath(identityClip.video_path)), "video/mp4",
    );
    const audioAsset = await uploadAsset(apiKey, await readFile(take.audio_path), "audio/mpeg");

    // --- Render each part.
    await setStage(runId, "rendering");
    const stored = await query<{ id: number; ordinal: number; text: string }>(
      `SELECT id, ordinal, text FROM script_segments WHERE run_id = $1 ORDER BY ordinal`, [runId],
    );

    for (const segment of stored) {
      const row = await one<{ id: number }>(
        `INSERT INTO avatar_renders (run_id, segment_id, ordinal, engine, status)
         VALUES ($1,$2,$3,'avatar_v','submitted') RETURNING id`,
        [runId, segment.id, segment.ordinal],
      );

      try {
        const { videoId } = await generateAvatarVideo(apiKey, {
          engine: "avatar_v",
          sourceKey: identityAsset.key,
          audioKey: audioAsset.key,
          title: `build ${run.build_id} · part ${segment.ordinal}`,
        });
        await query(`UPDATE avatar_renders SET provider_job = $2 WHERE id = $1`, [row!.id, videoId]);

        await setStage(runId, `rendering part ${segment.ordinal}/${stored.length}`);
        const result = await waitForVideo(apiKey, videoId);

        await query(
          `UPDATE avatar_renders SET status = 'completed', video_url = $2, finished_at = now() WHERE id = $1`,
          [row!.id, result.videoUrl],
        );
      } catch (error) {
        // One failed part does not abandon the others — the rest are still
        // worth having, and the failure is recorded against its own row.
        await query(
          `UPDATE avatar_renders SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
          [row!.id, error instanceof Error ? error.message : String(error)],
        );
      }
    }

    const failures = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM avatar_renders WHERE run_id = $1 AND status = 'failed'`, [runId],
    );

    await query(
      `UPDATE voice_runs SET status = $2, stage = 'done', finished_at = now() WHERE id = $1`,
      [runId, Number(failures?.count ?? 0) > 0 ? "completed_with_failures" : "completed"],
    );
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

/** The gate: record the operator's choice and release phase 2. */
export async function selectTake(runId: number, takeOrdinal: number): Promise<void> {
  await query(`UPDATE tts_takes SET selected = false WHERE run_id = $1`, [runId]);
  const updated = await one<{ id: number }>(
    `UPDATE tts_takes SET selected = true WHERE run_id = $1 AND ordinal = $2 RETURNING id`,
    [runId, takeOrdinal],
  );
  if (!updated) throw new Error(`Take ${takeOrdinal} not found on run ${runId}.`);
  await query(`UPDATE voice_runs SET status = 'selected', stage = 'selected' WHERE id = $1`, [runId]);
}
