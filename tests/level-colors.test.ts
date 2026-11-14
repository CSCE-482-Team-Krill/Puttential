import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGame, parseLevel, validateDocument, LEVEL_COLOR_SCHEMES } from '../src/game';
import type { LevelColorScheme } from '../src/game';
import { freshDocument, historyCommit, historyUndo, historyRedo } from '../src/editor/model';
import { saveLevel, loadLevel } from '../level-editor/editor/library';
import {
  validateCommunityDocument,
  validateCommunityStructure,
} from '../src/shared/community-profile';
import { openingCourse } from '../src/backend/daily-courses';
import { replayRun } from '../src/game/run-evaluation';
import { levelPalette } from '../src/frontend/level-colors';
import { prepareCommunityCandidate } from '../src/shared/community-candidate';
import manifest from '../src/community-verifier/engine-manifest.json';

const custom = { kind: 'custom', primary: '#243045', secondary: '#ffd966' } as const;
const schemes: readonly LevelColorScheme[] = [...LEVEL_COLOR_SCHEMES, custom];

test('schemes survive game JSON, editor documents, public admission and repository saves', async () => {
  const original = freshDocument();
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(original.level))), original.level);
  assert.equal('colorScheme' in original.level, false);
  assert.deepEqual(levelPalette(), levelPalette('classic'));
  assert.equal(LEVEL_COLOR_SCHEMES.length, 8);
  assert.deepEqual(levelPalette(custom), {
    label: 'Custom',
    background: custom.primary,
    walls: custom.secondary,
  });
  const directory = await mkdtemp(path.join(os.tmpdir(), 'puttential-colors-'));
  try {
    for (const colorScheme of schemes) {
      const document = validateDocument({
        ...original,
        level: {
          ...original.level,
          id: `scheme-${typeof colorScheme === 'string' ? colorScheme : 'custom'}`,
          colorScheme,
        },
      });
      assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(document.level))), document.level);
      assert.deepEqual(validateCommunityStructure(document).level.colorScheme, colorScheme);
      assert.deepEqual(validateCommunityDocument(document).level.colorScheme, colorScheme);
      const candidate = await prepareCommunityCandidate(
        document,
        'b3c12425-cca4-43a5-a6af-02e2c2a4e843',
        {
          simulationVersion: manifest.simulationVersion,
          rulesVersion: manifest.rulesVersion,
          artifactDigest: manifest.artifactDigest,
        },
      );
      assert.deepEqual(candidate.configuration.colorScheme, colorScheme);
      const history = historyCommit({ past: [], present: original, future: [] }, document);
      assert.deepEqual(historyUndo(history).present, original);
      assert.deepEqual(historyRedo(historyUndo(history)).present, document);
      await saveLevel(document, null, directory);
      const loaded = await loadLevel(document.level.id, directory);
      assert.equal(loaded.warning, '');
      assert.deepEqual(loaded.document, document);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid scheme data is rejected consistently by game and public import codecs', () => {
  const document = freshDocument();
  for (const colorScheme of [
    null,
    1,
    {},
    ['classic'],
    '#ff0000',
    'unknown',
    'toString',
    'custom',
    { ...custom, primary: '#abc' },
    { ...custom, secondary: 'red' },
    { ...custom, primary: 'url(https://example.com)' },
    { ...custom, secondary: null },
    { ...custom, primary: '#ffffffff' },
    { ...custom, extra: true },
    { primary: custom.primary, secondary: custom.secondary },
    { ...custom, kind: 'other' },
  ]) {
    const level = { ...document.level, colorScheme };
    assert.throws(() => parseLevel(level), /colorScheme/);
    assert.throws(() => validateCommunityStructure({ ...document, level }), /colorScheme/);
  }
});

test('all schemes produce identical trajectories and scored deterministic replays', async () => {
  const { level, rules, solutions } = openingCourse(0);
  const baseline = await replayRun(level, solutions[0]!, rules);
  assert.equal(baseline.outcome, 'success');
  const original = await createGame(level);
  try {
    const prediction = original.predict(solutions[0]!.commands, {
      maxTicks: 240,
      sampleEveryTicks: 1,
    });
    for (const colorScheme of schemes) {
      const themed = { ...level, colorScheme };
      assert.deepEqual(await replayRun(themed, solutions[0]!, rules), baseline);
      const game = await createGame(themed);
      try {
        assert.deepEqual(
          game.predict(solutions[0]!.commands, { maxTicks: 240, sampleEveryTicks: 1 }),
          prediction,
        );
      } finally {
        game.destroy();
      }
    }
  } finally {
    original.destroy();
  }
});
