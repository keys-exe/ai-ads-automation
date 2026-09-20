import type { NextConfig } from "next";

const config: NextConfig = {
  // The bundle assets are large; uploads go straight to storage rather than
  // through a server action, so the default body limit stays small on purpose.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default config;
