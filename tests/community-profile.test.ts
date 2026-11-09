import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { freshDocument, place, presets } from '../level-editor/editor/model';
import {
  convertCommunityImport,
  validateCommunityDocument,
  validateCommunityStructure,
  CommunityProfileError,
} from '../src/shared/community-profile';
import { communityInventory } from '../scripts/check-community-profile';
import { createGame } from '../src/game/simulation';

test('production profile reproduces all 33 source/sidecar checksums and reviewed outcomes', async () => {
  const actual = await communityInventory();
  const baseline = JSON.parse(
    await readFile('tests/fixtures/community-profile/compatibility-baseline.json', 'utf8'),
  );
  assert.deepEqual(actual, baseline);
  assert.equal(actual.rows.length, 33);
  assert.equal(actual.rows.filter((row) => row.original.accepted).length, 21);
  assert.equal(actual.rows.filter((row) => row.adjusted.accepted).length, 33);
  for (const row of actual.rows.filter((row) => !row.original.accepted))
    assert.deepEqual(
      row.original.issues.map((issue) => issue.path),
      ['level.prediction.maxTicks'],
    );
});
test('public profile rejects hostile physics and unsupported document structures', () => {
  const mutations: [string, (document: any) => void][] = [
    [
      'legacy',
      (d) => {
        d.version = 1;
      },
    ],
    [
      'unknown',
      (d) => {
        d.level.friction = 0.5;
      },
    ],
    [
      'reserved',
      (d) => {
        d.level.dynamicBodies[0].id = 'constructor';
      },
    ],
    [
      'unicode id',
      (d) => {
        d.level.dynamicBodies[0].id = 'báll';
      },
    ],
    [
      'gravity magnitude',
      (d) => {
        d.level.gravity = { x: 20, y: 20 };
      },
    ],
    [
      'velocity magnitude',
      (d) => {
        d.level.dynamicBodies[0].linearVelocity = { x: 40, y: 40 };
      },
    ],
    [
      'angular velocity',
      (d) => {
        d.level.dynamicBodies[0].angularVelocity = 20.1;
      },
    ],
    [
      'angle',
      (d) => {
        d.level.dynamicBodies[0].angle = 100 * Math.PI + 0.01;
      },
    ],
    [
      'density',
      (d) => {
        d.level.dynamicBodies[0].density = 0.099;
      },
    ],
    [
      'mass',
      (d) => {
        d.level.dynamicBodies[0].density = 0.1;
        d.level.dynamicBodies[0].pieces[0].shape.radius = 0.025;
      },
    ],
    [
      'out of bounds',
      (d) => {
        d.level.dynamicBodies[0].position.x = 7.4;
      },
    ],
    [
      'conflicting bounds',
      (d) => {
        d.level.bounds = { ...d.editor.arena.bounds, maxX: 7.4000000001 };
      },
    ],
    [
      'no bodies',
      (d) => {
        d.level.dynamicBodies = [];
      },
    ],
    [
      'piece count',
      (d) => {
        d.level.dynamicBodies[0].pieces = Array.from({ length: 17 }, (_, i) => ({
          id: `p-${i}`,
          shape: { kind: 'circle', radius: 0.1 },
        }));
      },
    ],
    [
      'duplicate piece',
      (d) => {
        d.level.dynamicBodies[0].pieces.push(structuredClone(d.level.dynamicBodies[0].pieces[0]));
      },
    ],
    [
      'static density',
      (d) => {
        d.level.staticBodies[0].pieces[0].density = 1;
      },
    ],
    [
      'material',
      (d) => {
        d.level.dynamicBodies[0].material.friction = 1;
      },
    ],
    [
      'goal hold',
      (d) => {
        d.level.goal.holdSeconds = 5.01;
      },
    ],
    [
      'goal target',
      (d) => {
        d.level.goal.bodyId = 'left-rail';
      },
    ],
    [
      'goal dimensions',
      (d) => {
        d.level.goal.maxX = d.level.goal.minX + 0.049;
      },
    ],
    [
      'prediction',
      (d) => {
        d.level.prediction = { maxTicks: 10, sampleEveryTicks: 11 };
      },
    ],
    [
      'border thickness',
      (d) => {
        d.editor.arena.thickness = 5.01;
      },
    ],
    [
      'managed walls',
      (d) => {
        d.level.staticBodies[0].position.x += 0.1;
      },
    ],
    [
      'malformed ccd',
      (d) => {
        d.level.dynamicBodies[0].ccd = 'true';
      },
    ],
  ];
  for (const [name, mutate] of mutations) {
    const document = freshDocument();
    mutate(document);
    assert.throws(() => validateCommunityDocument(document), CommunityProfileError, name);
  }
});
test('bounded incomplete geometry can save structurally but cannot prepare', () => {
  const document = freshDocument();
  (document.level.dynamicBodies[0]!.pieces[0] as any).shape = {
    kind: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ],
  };
  assert.doesNotThrow(() => validateCommunityStructure(document));
  assert.throws(
    () => validateCommunityDocument(document),
    (error: CommunityProfileError) => error.issues.some((issue) => issue.code === 'AREA'),
  );
  (document.level.dynamicBodies[0]!.pieces[0] as any).shape = {
    kind: 'polygon',
    points: Array.from({ length: 65 }, (_, i) => ({ x: i / 100, y: i % 2 })),
  };
  assert.throws(() => validateCommunityStructure(document), /points.length/);
});

test('aggregate piece, vertex and triangulation budgets reject bounded but expensive geometry', () => {
  const pieces = freshDocument();
  const wall = pieces.level.staticBodies[0]!;
  pieces.editor.arena.walls = [];
  pieces.level.staticBodies = Array.from({ length: 128 }, (_, i) => ({
    ...wall,
    id: `wall-${i}`,
    pieces: [
      { ...wall.pieces[0]!, id: 'a' },
      { ...wall.pieces[0]!, id: 'b' },
    ],
  }));
  assert.throws(
    () => validateCommunityStructure(pieces),
    (error: CommunityProfileError) =>
      error.issues.some((issue) => issue.path === 'level.totalPieces'),
  );
  const triangles = freshDocument();
  triangles.editor.arena.walls = [];
  triangles.level.staticBodies = [];
  const points = Array.from({ length: 64 }, (_, i) => ({
    x: Math.round(Math.cos((i * Math.PI) / 32) * 10000) / 10000,
    y: Math.round(Math.sin((i * Math.PI) / 32) * 10000) / 10000,
  }));
  triangles.level.fields = Array.from({ length: 64 }, (_, i) => ({
    id: `field-${i}`,
    angle: 0,
    position: { x: 0, y: 0 },
    enabled: false,
    shape: { kind: 'polygon', points },
    force: { kind: 'uniform', density: { x: 0, y: 0 } },
  }));
  assert.doesNotThrow(() => validateCommunityStructure(triangles));
  assert.throws(
    () => validateCommunityDocument(triangles),
    (error: CommunityProfileError) => error.issues.some((issue) => issue.code === 'TRIANGLES'),
  );
  triangles.level.staticBodies = [wall];
  assert.throws(
    () => validateCommunityStructure(triangles),
    (error: CommunityProfileError) =>
      error.issues.some((issue) => issue.path === 'level.totalVertices'),
  );
});
test('public force limits and portal coupling reject unsafe inventory', () => {
  for (const kind of ['uniform', 'attractor', 'repulsor', 'water', 'portal']) {
    const preset = presets.find((p) => p.force === kind)!;
    const document = place(freshDocument(), preset, { x: 0, y: 0 }).doc;
    assert.doesNotThrow(() => validateCommunityDocument(document));
    const force = document.level.fields.at(-1)!.force as any;
    if (kind === 'uniform') force.density = { x: 50, y: 1 };
    if (kind === 'attractor' || kind === 'repulsor') force.strength = 50.001;
    if (kind === 'water') force.sinkSpeed = 0.0009;
    if (kind === 'portal') force.delaySeconds = 1 / 121;
    assert.throws(() => validateCommunityDocument(document), CommunityProfileError, kind);
  }
  const document = place(
    freshDocument(),
    presets.find((p) => p.force === 'portal')!,
    { x: 0, y: 0 },
  ).doc;
  document.level.fields = document.level.fields.slice(0, 1);
  assert.throws(() => validateCommunityDocument(document), /two ends/);
});
test('explicit import conversions preserve originals and ignored static density preserves replay', async () => {
  const original = freshDocument();
  original.level.prediction = { maxTicks: 2400, sampleEveryTicks: 240 };
  (original.level.staticBodies[0]!.pieces[0] as any).density = 12;
  const before = structuredClone(original);
  assert.throws(() => validateCommunityDocument(original));
  const converted = convertCommunityImport(original, [
    'community-preview-limit',
    'remove-static-density',
  ]);
  const valid = validateCommunityDocument(converted);
  assert.deepEqual(original, before);
  assert.deepEqual(valid.level.prediction, { maxTicks: 1200, sampleEveryTicks: 120 });
  assert.equal('density' in valid.level.staticBodies[0]!.pieces[0]!, false);
  const a = await createGame(original.level),
    b = await createGame(valid.level);
  try {
    for (let tick = 0; tick < 120; tick++) {
      a.step();
      b.step();
      assert.deepEqual(a.getRenderState(), b.getRenderState());
    }
  } finally {
    a.destroy();
    b.destroy();
  }
});

test('preview conversion clamps sampling independently of the prediction length', () => {
  const original = freshDocument();
  original.level.prediction = { maxTicks: 1200, sampleEveryTicks: 240 };
  const converted = validateCommunityDocument(
    convertCommunityImport(original, ['community-preview-limit']),
  );
  assert.deepEqual(converted.level.prediction, { maxTicks: 1200, sampleEveryTicks: 120 });
  assert.equal(original.level.prediction.sampleEveryTicks, 240);
});
