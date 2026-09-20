/**
 * HeyGen adapter — Avatar V talking heads.
 *
 * ⚠️ UNVERIFIED AGAINST LIVE DOCS.
 *
 * api.heygen.com is blocked by this environment's egress policy, so the shapes
 * below come from the provider's published reference as surfaced by search,
 * not from the docs themselves and not from a live call. Check ENDPOINTS and
 * the generate body before trusting a run.
 *
 * What IS established:
 *   - Avatar V learns identity from a SHORT VIDEO (~15s), processed as a full
 *     context window, and holds that identity across angles and duration. It
 *     is selected with `engine.type: "avatar_v"`.
 *   - Avatar IV is the photo-to-video engine, at `/v2/video/av4/generate`.
 *   - Assets are uploaded first and referenced by the key the upload returns.
 *
 * The video-not-photo point is the reason this pipeline feeds Avatar V the
 * Kling clips rather than a still: it is what the engine is built to take.
 */

import { request, pollUntil, ProviderError } from "./http";

const BASE = "https://api.heygen.com";
const UPLOAD_BASE = "https://upload.heygen.com";

/** Verify these against the live reference before trusting a run. */
export const ENDPOINTS = {
  uploadAsset: `${UPLOAD_BASE}/v1/asset`,
  /** Avatar V — identity from video. */
  generateAvatarV: `${BASE}/v2/video/generate`,
  /** Avatar IV — identity from a single photo. Kept for the fallback path. */
  generateAvatarIV: `${BASE}/v2/video/av4/generate`,
  videoStatus: (videoId: string) => `${BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
} as const;

export type AvatarEngine = "avatar_v" | "avatar_iv";

function authHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey };
}

export interface UploadedAsset {
  key: string;
  url: string | null;
}

/** Upload a source file and get back the key later calls reference. */
export async function uploadAsset(
  apiKey: string,
  data: Buffer,
  contentType: string,
): Promise<UploadedAsset> {
  const result = await request<{ data?: { id?: string; image_key?: string; video_key?: string; url?: string } }>(
    "heygen",
    ENDPOINTS.uploadAsset,
    {
      method: "POST",
      headers: { ...authHeaders(apiKey), "content-type": contentType },
      body: new Uint8Array(data),
      timeoutMs: 600_000,
    },
  );

  // The key's field name differs by asset type in the published examples, so
  // all three spellings are accepted rather than assuming one.
  const key = result?.data?.video_key ?? result?.data?.image_key ?? result?.data?.id;
  if (!key) throw new ProviderError("heygen", null, "upload returned no asset key");

  return { key, url: result?.data?.url ?? null };
}

export interface AvatarVideoRequest {
  engine: AvatarEngine;
  /** Asset key for the identity source: a video for Avatar V, a photo for IV. */
  sourceKey: string;
  /** Asset key for the audio the lips conform to — the chosen TTS take. */
  audioKey: string;
  /** Avatar V accepts a motion prompt; §28B's landings belong here, not in prose. */
  motionPrompt?: string;
  enhanceMotionPrompt?: boolean;
  title?: string;
  dimension?: { width: number; height: number };
}

/**
 * Submit an avatar render.
 *
 * Audio is supplied rather than synthesised here: the whole point of this
 * route is that lips conform to a real take, which is what dissolves §28H's
 * sync discipline and §22D's voice drift.
 */
export async function generateAvatarVideo(
  apiKey: string,
  input: AvatarVideoRequest,
): Promise<{ videoId: string }> {
  const endpoint = input.engine === "avatar_v" ? ENDPOINTS.generateAvatarV : ENDPOINTS.generateAvatarIV;

  const body: Record<string, unknown> = {
    video_inputs: [
      {
        character: input.engine === "avatar_v"
          ? { type: "avatar_v", video_asset_id: input.sourceKey }
          : { type: "talking_photo", talking_photo_id: input.sourceKey },
        voice: { type: "audio", audio_asset_id: input.audioKey },
      },
    ],
    // 9:16 by default, matching §44.38's aspect lock for the rest of the build.
    dimension: input.dimension ?? { width: 1080, height: 1920 },
  };

  if (input.title) body.title = input.title;
  if (input.motionPrompt) {
    body.custom_motion_prompt = input.motionPrompt;
    body.enhance_custom_motion_prompt = input.enhanceMotionPrompt ?? false;
  }

  const result = await request<{ data?: { video_id?: string }; error?: unknown }>(
    "heygen", endpoint,
    {
      method: "POST",
      headers: { ...authHeaders(apiKey), "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 120_000,
    },
  );

  const videoId = result?.data?.video_id;
  if (!videoId) throw new ProviderError("heygen", null, `generate returned no video_id: ${JSON.stringify(result).slice(0, 300)}`);

  return { videoId };
}

export interface VideoStatus {
  status: string;
  videoUrl: string | null;
  error: string | null;
}

export async function getVideoStatus(apiKey: string, videoId: string): Promise<VideoStatus> {
  const result = await request<{
    data?: { status?: string; video_url?: string; error?: { message?: string } | string };
  }>("heygen", ENDPOINTS.videoStatus(videoId), { headers: authHeaders(apiKey) });

  const data = result?.data ?? {};
  const rawError = data.error;
  return {
    status: data.status ?? "unknown",
    videoUrl: data.video_url ?? null,
    error: typeof rawError === "string" ? rawError : rawError?.message ?? null,
  };
}

const TERMINAL_OK = new Set(["completed", "succeeded", "success", "done"]);
const TERMINAL_FAIL = new Set(["failed", "error"]);

/** Poll a render to completion. */
export async function waitForVideo(
  apiKey: string,
  videoId: string,
  timeoutMs = 20 * 60 * 1000,
): Promise<VideoStatus> {
  return pollUntil<VideoStatus>(
    "heygen",
    async () => {
      const status = await getVideoStatus(apiKey, videoId);
      const state = status.status.toLowerCase();
      if (TERMINAL_FAIL.has(state)) {
        throw new ProviderError("heygen", null, `render failed: ${status.error ?? state}`);
      }
      return TERMINAL_OK.has(state) ? status : null;
    },
    { timeoutMs, intervalMs: 10_000, label: `video ${videoId}` },
  );
}

/** Read-only, used by the Settings connection test. */
export async function getQuota(apiKey: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("heygen", `${BASE}/v2/user/remaining_quota`, {
    headers: authHeaders(apiKey),
  });
}
