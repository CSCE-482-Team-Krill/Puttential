import path from "node:path";
import type { NextConfig } from "next";

// The game engine lives in the repository's src/game, outside this project.
const repositoryRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};

export default nextConfig;
