import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone tracing needs symlink support; enabled only for the Docker (Linux) build
  // because Windows dev machines hit EPERM with pnpm's symlinked node_modules.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: [
    "@emerge/core",
    "@emerge/db",
    "@emerge/ui",
    "@emerge/ai",
    "@emerge/email",
    "@emerge/reports"
  ],
  // @emerge/ai pulls server-only SDKs (anthropic/openai/unpdf/mammoth); keep them
  // external to the server bundle so Next does not try to bundle their internals.
  serverExternalPackages: ["@anthropic-ai/sdk", "openai", "unpdf", "mammoth"],
  // @emerge/email is authored NodeNext-style with explicit ".js" extensions on
  // its relative re-exports. The standalone webpack build does not map those to
  // the ".ts" sources on its own, so teach the resolver to try ".ts" first.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ...config.resolve.extensionAlias
    };
    return config;
  }
};

export default nextConfig;
