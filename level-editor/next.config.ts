import path from 'node:path';
import type { NextConfig } from 'next';
const root = path.join(__dirname, '..');
const config: NextConfig = { agentRules: false, outputFileTracingRoot: root, turbopack: { root } };
export default config;
