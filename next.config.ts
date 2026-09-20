import type { NextConfig } from "next";

const config: NextConfig = {
  // Standalone output traces exactly the dependencies the server needs, which
  // keeps the web image small. The worker image stays heavy on purpose — it
  // carries ffmpeg, tesseract and Whisper — so the two are built separately
  // rather than from one shared image.
  output: "standalone",
  // The bundle assets are large; uploads go straight to storage rather than
  // through a server action, so the default body limit stays small on purpose.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default config;
