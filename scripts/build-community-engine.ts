import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { RULES_VERSION, SIMULATION_VERSION } from '../src/game/run-evaluation';
import { canonicalJson } from '../src/shared/community-canonical-json';

async function main() {
  const result = await build({
    entryPoints: ['src/community-verifier/engine-entry.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'inline',
    charset: 'utf8',
  });
  const bytes = result.outputFiles[0]!.contents;
  const digest = createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    contract: 'community-engine-manifest-v1',
    simulationVersion: SIMULATION_VERSION,
    rulesVersion: RULES_VERSION,
    artifactDigest: digest,
    bundler: 'esbuild-0.28.2',
    format: 'esm',
    target: 'es2022',
    bytes: bytes.length,
  };
  const file = 'src/community-verifier/engine-manifest.json';
  if (process.argv.includes('--write-manifest'))
    await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  else if (canonicalJson(JSON.parse(await readFile(file, 'utf8'))) !== canonicalJson(manifest))
    throw new Error(
      'Engine artifact changed. Review physics/evaluation and update the registry deliberately.',
    );
  await mkdir('artifacts/community-editor/engine', { recursive: true });
  await writeFile(`artifacts/community-editor/engine/${digest}.mjs`, bytes);
  console.log(JSON.stringify(manifest));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
