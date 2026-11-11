import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('shared browser editor and gameplay bundles exclude repository, database and competitive ownership capabilities', async () => {
  const bundle = await build({
    entryPoints: ['src/editor/editor.tsx', 'src/frontend/gameplay/gameplay-view.tsx'],
    outdir: 'artifacts/community-editor/boundary-check',
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    metafile: true,
    treeShaking: false,
    loader: { '.png': 'dataurl' },
  });
  const forbidden =
    /(?:src\/backend\/|level-editor\/|\/course-session\.ts$|\/guest-session\.ts$|\/progress-storage\.ts$|\/authoritative-state\.ts$|\/submission-queue\.ts$|\/request-scheduler\.ts$|\/run-ownership\.ts$|src\/frontend\/api\.ts$)/;
  const included = Object.keys(bundle.metafile!.inputs).map((file) => file.replaceAll('\\', '/'));
  assert.deepEqual(
    included.filter((file) => forbidden.test(file)),
    [],
  );
  assert.ok(included.includes('src/editor/model.ts'));
  assert.ok(included.includes('src/game/simulation.ts'));
});
