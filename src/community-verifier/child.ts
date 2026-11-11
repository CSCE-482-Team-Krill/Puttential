import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { canonicalJson } from '../shared/community-canonical-json';
import { decodeVerifierInput, performCommunityWork } from './work';
import manifest from './engine-manifest.json';

async function main() {
  // Fixed deployment root supplied by the operator, never derived from uploaded work.
  const directory = process.argv[2];
  if (!directory) throw new Error('Artifact directory required');
  const file = path.resolve(directory, `${manifest.artifactDigest}.mjs`);
  const artifactBytes = await readFile(file);
  if (createHash('sha256').update(artifactBytes).digest('hex') !== manifest.artifactDigest)
    throw new Error('Artifact checksum mismatch');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error('Work input exceeds limit');
    chunks.push(chunk);
  }
  const input = decodeVerifierInput(Buffer.concat(chunks));
  if (
    input.engine.artifactDigest !== manifest.artifactDigest ||
    input.engine.rulesVersion !== manifest.rulesVersion ||
    input.engine.simulationVersion !== manifest.simulationVersion
  )
    throw new Error('Engine unavailable');
  const artifact = await import(pathToFileURL(file).href);
  const output = await performCommunityWork(input, artifact);
  process.stdout.write(canonicalJson(output));
}
main().catch(() => {
  // Never echo inputs, proof data or exception stacks to operational logs.
  process.stderr.write('Community verifier rejected work\n');
  process.exitCode = 1;
});
