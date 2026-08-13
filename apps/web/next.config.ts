import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone tracing needs symlink support; enabled only for the Docker (Linux) build
  // because Windows dev machines hit EPERM with pnpm's symlinked node_modules.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: ["@emerge/core", "@emerge/db", "@emerge/ui"]
};

export default nextConfig;
