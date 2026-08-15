import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone tracing needs symlink support; enabled only for the Docker (Linux) build
  // because Windows dev machines hit EPERM with pnpm's symlinked node_modules.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: ["@emerge/core", "@emerge/db", "@emerge/ui", "@emerge/ai"],
  // @emerge/ai pulls server-only SDKs (anthropic/openai/unpdf/mammoth); keep them
  // external to the server bundle so Next does not try to bundle their internals.
  serverExternalPackages: ["@anthropic-ai/sdk", "openai", "unpdf", "mammoth"]
};

export default nextConfig;
