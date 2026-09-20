import { run } from "./exec";

export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  /** "9:16", "16:9", "1:1" — reduced from the pixel dimensions, not the container tag. */
  aspectRatio: string;
  frameRate: number;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Instrument 1 — duration, aspect, resolution. Settles the §3 format lock inputs. */
export async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    path,
  ]);

  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      duration?: string;
    }>;
  };

  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  if (!video) throw new Error("No video stream found in the uploaded file.");

  const width = video.width ?? 0;
  const height = video.height ?? 0;
  const divisor = gcd(width, height) || 1;

  // avg_frame_rate arrives as a rational string, e.g. "30000/1001".
  const [num, den] = (video.avg_frame_rate ?? "0/1").split("/").map(Number);
  const frameRate = den ? num / den : 0;

  return {
    durationSeconds: Number(data.format?.duration ?? video.duration ?? 0),
    width,
    height,
    aspectRatio: `${width / divisor}:${height / divisor}`,
    frameRate: Number(frameRate.toFixed(3)),
    hasAudio: Boolean(audio),
    videoCodec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
  };
}
