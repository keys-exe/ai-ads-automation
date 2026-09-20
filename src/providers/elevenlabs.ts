/**
 * ElevenLabs adapter — Instant Voice Clone and Eleven v3 speech.
 *
 * ⚠️ UNVERIFIED AGAINST LIVE DOCS.
 *
 * This environment's egress policy blocks api.elevenlabs.io, so the request
 * shapes below were written from the provider's published reference as
 * surfaced by search, NOT read from the API docs and NOT exercised against the
 * service. Everything under ENDPOINTS and the two request builders should be
 * checked on first run somewhere with open egress. The surrounding pipeline —
 * audio extraction, take scoring, splitting — is verified and does not depend
 * on these shapes being right.
 *
 * What IS established:
 *   - The model id for Eleven v3 is `eleven_v3`.
 *   - Eleven v3 accepts up to 3,000 characters per request, which is one of
 *     the reasons the script is split before synthesis.
 *   - IVC takes AUDIO samples. MP3 at 192kbps or above is recommended and
 *     uncompressed WAV can cause upload problems. This is why the pipeline
 *     extracts an MP3 track from the Kling clips rather than uploading video.
 */

import { request, ProviderError } from "./http";

const BASE = "https://api.elevenlabs.io";

/** Verify these four against the live reference before trusting a run. */
export const ENDPOINTS = {
  addVoice: `${BASE}/v1/voices/add`,
  textToSpeech: (voiceId: string) => `${BASE}/v1/text-to-speech/${voiceId}`,
  getVoice: (voiceId: string) => `${BASE}/v1/voices/${voiceId}`,
  deleteVoice: (voiceId: string) => `${BASE}/v1/voices/${voiceId}`,
} as const;

export const ELEVEN_V3 = "eleven_v3";

/** Eleven v3's per-request ceiling. The splitter treats this as a hard gate. */
export const V3_CHAR_LIMIT = 3000;

/** MP3 at 192kbps — the format the provider recommends for cloning samples. */
export const SAMPLE_FORMAT = { extension: "mp3", bitrate: "192k", mimeType: "audio/mpeg" } as const;

function authHeaders(apiKey: string): Record<string, string> {
  return { "xi-api-key": apiKey };
}

export interface VoiceSample {
  filename: string;
  data: Buffer;
  mimeType?: string;
}

export interface ClonedVoice {
  voiceId: string;
  name: string;
  requiresVerification: boolean;
}

/**
 * Create an Instant Voice Clone from audio samples.
 *
 * Samples must be audio. Passing a video file here is the most likely way for
 * this call to fail, which is why the pipeline extracts the track first.
 */
export async function createInstantVoiceClone(
  apiKey: string,
  name: string,
  samples: VoiceSample[],
  options: { description?: string; labels?: Record<string, string> } = {},
): Promise<ClonedVoice> {
  if (!samples.length) throw new ProviderError("elevenlabs", null, "at least one audio sample is required");

  const form = new FormData();
  form.set("name", name);
  if (options.description) form.set("description", options.description);
  if (options.labels) form.set("labels", JSON.stringify(options.labels));

  for (const sample of samples) {
    form.append(
      "files",
      new Blob([new Uint8Array(sample.data)], { type: sample.mimeType ?? SAMPLE_FORMAT.mimeType }),
      sample.filename,
    );
  }

  const result = await request<{ voice_id?: string; requires_verification?: boolean }>(
    "elevenlabs",
    ENDPOINTS.addVoice,
    { method: "POST", headers: authHeaders(apiKey), body: form, timeoutMs: 300_000 },
  );

  if (!result?.voice_id) {
    throw new ProviderError("elevenlabs", null, "voice creation returned no voice_id");
  }

  return {
    voiceId: result.voice_id,
    name,
    requiresVerification: Boolean(result.requires_verification),
  };
}

export interface SpeechOptions {
  modelId?: string;
  /** Provider-specific tuning. Left open rather than guessed at field by field. */
  voiceSettings?: Record<string, unknown>;
  /** Changes the take without changing the text — how several takes are produced. */
  seed?: number;
  outputFormat?: string;
}

/**
 * Synthesise speech. Returns raw audio bytes.
 *
 * The caller is responsible for keeping `text` under V3_CHAR_LIMIT; the
 * splitter does that upstream, so a breach here is a bug rather than input.
 */
export async function textToSpeech(
  apiKey: string,
  voiceId: string,
  text: string,
  options: SpeechOptions = {},
): Promise<Buffer> {
  if (text.length > V3_CHAR_LIMIT) {
    throw new ProviderError(
      "elevenlabs", null,
      `text is ${text.length} characters, over the ${V3_CHAR_LIMIT} ceiling — split before synthesising`,
    );
  }

  const url = new URL(ENDPOINTS.textToSpeech(voiceId));
  if (options.outputFormat) url.searchParams.set("output_format", options.outputFormat);

  const body: Record<string, unknown> = {
    text,
    model_id: options.modelId ?? ELEVEN_V3,
  };
  if (options.voiceSettings) body.voice_settings = options.voiceSettings;
  if (options.seed !== undefined) body.seed = options.seed;

  const audio = await request<ArrayBuffer>("elevenlabs", url.toString(), {
    method: "POST",
    headers: { ...authHeaders(apiKey), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify(body),
    expect: "binary",
    timeoutMs: 300_000,
  });

  return Buffer.from(audio);
}

/** Read-only, used by the Settings connection test. */
export async function listVoices(apiKey: string): Promise<Array<{ voice_id: string; name: string }>> {
  const result = await request<{ voices?: Array<{ voice_id: string; name: string }> }>(
    "elevenlabs", `${BASE}/v1/voices`, { headers: authHeaders(apiKey) },
  );
  return result?.voices ?? [];
}
