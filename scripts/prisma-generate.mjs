// Generates the Prisma Client for the runtime we are building for.
//
// Default: Node.js (next dev, the seed script, tests, Vercel).
// PRISMA_RUNTIME=cloudflare (set only by the Cloudflare preview/deploy
// scripts): generates the Workers client, which loads Prisma's WebAssembly at
// bundle time. Workers forbid compiling Wasm at runtime, and the Workers
// client cannot run under Node.js, so the two must be generated separately.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.PRISMA_RUNTIME ?? 'nodejs';
const args = ['prisma', 'generate', '--no-hints'];
let tempSchema;

if (runtime === 'cloudflare') {
  const schema = readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
  const patched = schema.replace(
    /(provider\s*=\s*"prisma-client"[^\n]*\n)/,
    '$1  runtime  = "cloudflare"\n',
  );
  if (patched === schema) {
    throw new Error('Could not find the prisma-client generator in prisma/schema.prisma.');
  }
  // Same folder as the real schema, so `output` resolves to the same place.
  tempSchema = path.join(root, 'prisma', '.schema.cloudflare.prisma');
  writeFileSync(tempSchema, patched);
  args.push('--schema', tempSchema);
} else if (runtime === 'nodejs') {
  args.push('--config', path.join(root, 'prisma7.config.ts'));
} else {
  throw new Error(`Unsupported PRISMA_RUNTIME: ${runtime}`);
}

try {
  execFileSync('npx', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
} finally {
  if (tempSchema) rmSync(tempSchema, { force: true });
}
