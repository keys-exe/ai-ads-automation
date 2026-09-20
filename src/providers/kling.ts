/**
 * Kling adapter — the source clips for the voice route.
 *
 * ⚠️ UNVERIFIED AGAINST LIVE DOCS. api.klingai.com is blocked by this
 * environment's egress policy. Check ENDPOINTS and the request body before
 * trusting a run.
 *
 * Note that the pipeline does not depend on this file to function: the source
 * clips may equally be uploaded by hand, which is the path to use until this
 * adapter is verified. What the clips must satisfy is fixed either way —
 * around ten seconds, a single speaking head, and a real audio track, because
 * one feeds a voice clone and the other an avatar identity.
 */

import { request, pollUntil, ProviderError } from "./http";

const BASE = "https://api.klingai.com";

export const ENDPOINTS = {
  text2video: `${BASE}/v1/videos/text2video`,
  image2video: `${BASE}/v1/videos/image2video`,
  queryTask: (id: string) => `${BASE}/v1/videos/text2video/${encodeURIComponent(id)}`,
} as const;

/** §44.5's video lock. */
export const KLING_MODEL = "kling-video-v3_0_omni";

export interface ClipRequest {
  prompt: string;
  /** §44.38 keeps the build at 9:16. */
  aspectRatio?: string;
  durationSeconds?: number;
  /** §22C: the generated voice is the character's voice, so audio stays on. */
  enableAudio?: boolean;
  /** §44.5: never let the model cut inside a clip. */
  preferMultiShots?: boolean;
  imageUrl?: string;
}

export async function createClip(apiKey: string, input: ClipRequest): Promise<{ taskId: string }> {
  const endpoint = input.imageUrl ? ENDPOINTS.image2video : ENDPOINTS.text2video;

  const body: Record<string, unknown> = {
    model_name: KLING_MODEL,
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? "9:16",
    duration: String(input.durationSeconds ?? 10),
    enable_audio: input.enableAudio ?? true,
    prefer_multi_shots: input.preferMultiShots ?? false,
  };
  if (input.imageUrl) body.image = input.imageUrl;

  const result = await request<{ data?: { task_id?: string } }>("kling", endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 120_000,
  });

  const taskId = result?.data?.task_id;
  if (!taskId) throw new ProviderError("kling", null, "clip submission returned no task id");
  return { taskId };
}

export interface ClipResult {
  status: string;
  videoUrl: string | null;
  durationSeconds: number | null;
}

export async function getClip(apiKey: string, taskId: string): Promise<ClipResult> {
  const result = await request<{
    data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string; duration?: string }> } };
  }>("kling", ENDPOINTS.queryTask(taskId), { headers: { Authorization: `Bearer ${apiKey}` } });

  const data = result?.data ?? {};
  const video = data.task_result?.videos?.[0];
  return {
    status: data.task_status ?? "unknown",
    videoUrl: video?.url ?? null,
    durationSeconds: video?.duration ? Number(video.duration) : null,
  };
}

export async function waitForClip(apiKey: string, taskId: string, timeoutMs = 20 * 60 * 1000): Promise<ClipResult> {
  return pollUntil<ClipResult>(
    "kling",
    async () => {
      const result = await getClip(apiKey, taskId);
      const state = result.status.toLowerCase();
      if (state === "failed" || state === "error") {
        throw new ProviderError("kling", null, `clip ${taskId} failed`);
      }
      return state === "succeed" || state === "succeeded" || state === "completed" ? result : null;
    },
    { timeoutMs, intervalMs: 10_000, label: `clip ${taskId}` },
  );
}
