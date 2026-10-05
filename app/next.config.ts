import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Agent SDK lanza el proceso de Claude Code: no empaquetarlo.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
};

export default nextConfig;
