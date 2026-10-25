import path from 'node:path';
import type { NextConfig } from 'next';
import { config } from 'dotenv';

// Share the repository root with the engine, backend and level editor.
const repositoryRoot = path.join(__dirname, '../..');
// Next runs in this workspace; the CLI and backend also use the root .env.
config({ path: path.join(repositoryRoot, '.env'), quiet: true });

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  // pg loads pg-cloudflare only on Cloudflare Workers. `next build` traces files
  // under Node.js, where that code is never reached, so include it explicitly
  // for the API routes that talk to the database.
  outputFileTracingIncludes: {
    '/api/**': ['../../node_modules/pg-cloudflare/dist/**'],
  },
};

export default nextConfig;
