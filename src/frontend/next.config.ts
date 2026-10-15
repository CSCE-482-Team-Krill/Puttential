import path from 'node:path';
import type { NextConfig } from 'next';

// Share the repository root with the engine, backend and level editor.
const repositoryRoot = path.join(__dirname, '../..');

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};

export default nextConfig;
