import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { run } from "./exec";
import { probe } from "./probe";

/**
 * Extract an audio track from a video.
 *
 * This step exists because ElevenLabs' Instant Voice Clone takes AUDIO
 * samples, not video. The source clips are video, so the track comes out
 * first. Uploading the clip directly is the most likely way for the clone call
 * to fail, and it would fail after the upload rather than before it.
 *
 * MP3 at 192kbps because that is what the provider recommends for cloning
 * samples; uncompressed WAV reportedly does not improve the clone and can
 * cause upload problems, so it is not offered here.
 */
export interface ExtractedAudio {
  path: string;
  durationSeconds: number;
  bitrate: string;
}

export async function extractAudio(
  videoPath: string,
  outputPath: string,
  bitrate = "192k",
): Promise<ExtractedAudio> {
  const source = await probe(videoPath);
  if (!source.hasAudio) {
    throw new Error(
      `${videoPath} has no audio stream. A silent clip cannot seed a voice clone — regenerate it with audio enabled.`,
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });

  await run("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-vn",                  // drop the video stream
    "-acodec", "libmp3lame",
    "-b:a", bitrate,
    "-ar", "44100",
    outputPath,
  ]);

  const result = await probe(outputPath).catch(() => null);
  return {
    path: outputPath,
    // ffprobe on an audio-only file reports duration on the container.
    durationSeconds: result?.durationSeconds ?? source.durationSeconds,
    bitrate,
  };
}
