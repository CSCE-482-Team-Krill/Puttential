import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { starterDocument, tutorialLevel } from '../src/game/levels/starters';
import { parseDocument } from '../src/game/levels/codec';
import { freshDocument, place, presets } from '../src/editor/model';
import { canonicalJson } from '../src/shared/community-canonical-json';
import {
  COMMUNITY_PROFILE,
  CommunityProfileError,
  convertCommunityImport,
  validateCommunityDocument,
} from '../src/shared/community-profile';
import { decodeStrictJson } from '../src/shared/strict-json';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const baselinePath = path.resolve('tests/fixtures/community-profile/compatibility-baseline.json');
export async function communityInventory() {
  const fixtures: {
    group: string;
    name: string;
    input: unknown;
    sourceHash: string;
    sidecarHash: string | null;
  }[] = [];
  const directory = path.resolve('src/game/levels/authored');
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith('.json') && !name.endsWith('.editor.json'))
    .sort()) {
    const source = await readFile(path.join(directory, name));
    const sidecar = await readFile(path.join(directory, name.replace('.json', '.editor.json')));
    const metadata = decodeStrictJson(sidecar) as {
      version: number;
      levelRevision: string;
      editor: unknown;
    };
    if (metadata.levelRevision !== sha(source))
      throw new Error(`${name}: sidecar checksum mismatch`);
    fixtures.push({
      group: 'authored',
      name,
      input: {
        version: metadata.version,
        level: decodeStrictJson(source),
        editor: metadata.editor,
      },
      sourceHash: sha(source),
      sidecarHash: sha(sidecar),
    });
  }
  const append = (group: string, name: string, input: unknown) =>
    fixtures.push({ group, name, input, sourceHash: sha(canonicalJson(input)), sidecarHash: null });
  for (let i = 0; i < 2; i++) append('starter', starterDocument(i).level.id, starterDocument(i));
  append('tutorial', tutorialLevel.id, parseDocument(tutorialLevel));
  append('template', 'blank-course', freshDocument());
  for (const preset of presets)
    append('palette', preset.id, place(freshDocument(), preset, { x: 0, y: 0 }).doc);
  const outcome = (input: unknown) => {
    try {
      validateCommunityDocument(input);
      return { accepted: true, issues: [] };
    } catch (error) {
      if (!(error instanceof CommunityProfileError)) throw error;
      return { accepted: false, issues: error.issues };
    }
  };
  const rows = fixtures.map(({ input, ...fixture }) => {
    const adjusted = convertCommunityImport(input, [
      'community-preview-limit',
      'remove-static-density',
    ]);
    return {
      ...fixture,
      original: outcome(input),
      adjusted: outcome(adjusted),
      adjustedHash: sha(canonicalJson(adjusted)),
      originalDocumentHash: sha(canonicalJson(input)),
    };
  });
  return {
    profile: COMMUNITY_PROFILE,
    sourceBaseline: 'b3c12425cca443a56af02e2c2a4e8430da035f83',
    rows,
  };
}
async function main() {
  const inventory = await communityInventory();
  if (process.argv.includes('--write-baseline')) {
    await writeFile(baselinePath, JSON.stringify(inventory, null, 2) + '\n');
    console.log('Wrote review baseline; checksum/outcome changes require explicit review.');
  } else {
    const baseline = decodeStrictJson(await readFile(baselinePath));
    if (canonicalJson(baseline) !== canonicalJson(inventory))
      throw new Error(
        'Community fixture inventory changed; review source checksums and production-validator outcomes.',
      );
  }
  console.log(
    JSON.stringify({
      node: process.version,
      profile: COMMUNITY_PROFILE,
      total: inventory.rows.length,
      accepted: inventory.rows.filter((row) => row.original.accepted).length,
      acceptedAfterConversion: inventory.rows.filter((row) => row.adjusted.accepted).length,
      inventoryHash: sha(canonicalJson(inventory)),
    }),
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
