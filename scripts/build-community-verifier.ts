import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

async function main() {
  await mkdir('artifacts/community-editor/verifier', { recursive: true });
  await build({
    entryPoints: ['src/community-verifier/child.ts'],
    outfile: 'artifacts/community-editor/verifier/child.mjs',
    bundle: true,
    platform: 'node',
    mainFields: ['module', 'main'],
    target: 'node22.12',
    format: 'esm',
    packages: 'bundle',
    legalComments: 'inline',
  });
  console.log(
    'Built CPU-only verifier child. Selected-host isolation and authority gates remain unproven.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
