import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import RAPIER from '@dimforge/rapier2d-compat';
import {
  createGame,
  parseLevel,
  decodeLevel,
  encodeLevel,
  forceCatalog,
  forceDensity,
  starterDocument,
  starterLevels,
  validateDocument,
  resizeArena,
  FIXED_DT,
  shapeOutline,
} from '../src/game';
import type { LevelDocument, RenderState } from '../src/game';
import { buildPhysicsWorld } from '../src/game/objects/bodies';
import { levelFrame } from '../src/frontend/level-frame';
import { advanceGoal, initialGoal } from '../src/frontend/goal-progress';
import {
  duplicate,
  edit,
  freshDocument,
  historyCommit,
  historyRedo,
  historyUndo,
  move,
  place,
  presets,
  scaleObject,
  setOutline,
  objectBounds,
  objectContains,
  editablePolygon,
} from '../level-editor/editor/model';
import { loadLevel, saveLevel, listLevels } from '../level-editor/editor/library';

function legacyDocument(doc: LevelDocument) {
  const { formatVersion, version, prediction, goal, ...level } = doc.level;
  const bodies = (list: typeof level.staticBodies) =>
    list.map((body) => ({
      ...body,
      pieces: body.pieces.map(({ shape, ...piece }) => ({
        ...piece,
        localPolygon: shapeOutline(shape),
      })),
    }));
  const { bodyId, holdSeconds, ...area } = goal;
  return {
    version: 1,
    level: {
      ...level,
      name: doc.editor.name,
      dynamicBodies: bodies(level.dynamicBodies),
      staticBodies: bodies(level.staticBodies),
      fields: level.fields.map(({ shape, force, ...field }) => {
        const { kind, ...params } = force;
        return { ...field, localPolygon: shapeOutline(shape), force: { kind, params } };
      }),
      goal: { bodyId, holdSeconds, area },
    },
    editor: { arena: doc.editor.arena },
  };
}

test('both upstream JSON starters round-trip and replay identically with shared Rapier', async () => {
  assert.equal(starterLevels.length, 2);
  for (const [index, original] of starterLevels.entries()) {
    const doc = starterDocument(index);
    const decoded = decodeLevel(JSON.parse(JSON.stringify(doc.level)));
    assert.deepEqual(encodeLevel(decoded), original);
    assert.deepEqual(validateDocument(original).level, original);
    const [a, b] = await Promise.all([createGame(original), createGame(decoded)]);
    try {
      for (const [sequence, field] of original.fields.entries()) {
        const command = {
          type: 'set-field-enabled' as const,
          fieldId: field.id,
          enabled: true,
          sequence,
        };
        a.queueCommand(command);
        b.queueCommand(command);
      }
      for (let tick = 0; tick < 240; tick++) {
        a.step();
        b.step();
      }
      assert.deepEqual(b.getRenderState(), a.getRenderState(), original.id);
      assert.deepEqual(b.predict([], { maxTicks: 120 }), a.predict([], { maxTicks: 120 }));
      assert.deepEqual(
        levelFrame(original).bodies.map((b) => b.pieces.map((p) => p.kind)),
        a.getRenderState().bodies.map((b) => b.pieces.map((p) => p.kind)),
      );
    } finally {
      a.destroy();
      b.destroy();
    }
  }
});

test('native circle uses Rapier ball geometry, disc mass, render data, exact bounds and hit testing', async () => {
  const doc = edit(freshDocument(), (d) => {
    d.level.dynamicBodies[0]!.pieces[0]!.density = 2.5;
  });
  const game = await createGame(doc.level); // initializes the shared Rapier runtime
  const { world, bodyHandles } = buildPhysicsWorld(doc.level, FIXED_DT);
  try {
    const body = world.getRigidBody(bodyHandles.ball!),
      collider = body.collider(0);
    assert.equal(collider.shapeType(), RAPIER.ShapeType.Ball);
    assert.ok(Math.abs(collider.radius() - 0.4) < 1e-6);
    assert.ok(Math.abs(body.mass() - Math.PI * 0.4 ** 2 * 2.5) < 1e-6);
    assert.ok(Math.abs(body.principalInertia() - (Math.PI * 0.4 ** 4 * 2.5) / 2) < 1e-6);
    assert.deepEqual(game.getRenderState().bodies[0]!.pieces[0], {
      id: 'ball-piece',
      kind: 'circle',
      center: { x: -4, y: 0 },
      radius: 0.4,
    });
  } finally {
    world.free();
    game.destroy();
  }
  const selected = { kind: 'dynamicBodies' as const, id: 'ball' };
  const edge = edit(doc, (d) => {
    d.level.dynamicBodies[0]!.position = { x: 7, y: 0 };
    d.level.dynamicBodies[0]!.angle = Math.PI / 7;
  });
  assert.equal(objectBounds(edge, selected).maxX, 7.4);
  assert.throws(() => move(edge, selected, { x: 0.0001, y: 0 }), /outside/);
  assert.ok(objectContains(edge, selected, { x: 7.39999, y: 0 }));
  assert.ok(!objectContains(edge, selected, { x: 7.4, y: 0.001 }));
  assert.throws(() => scaleObject(doc, selected, 1, 2), /uniformly/);
  const scaled = scaleObject(doc, selected, 1, 1);
  assert.deepEqual(scaled.level.dynamicBodies[0]!.pieces[0]!.shape, {
    kind: 'circle',
    radius: 0.5,
  });
  assert.throws(
    () =>
      edit(doc, (d) => {
        editablePolygon(d.level.dynamicBodies[0]!, 0);
      }),
    /no vertices/,
  );
});

test('all upstream force kinds supply data, palette and property controls', () => {
  assert.deepEqual(
    forceCatalog.map((f) => f.kind),
    ['uniform', 'attractor', 'repulsor', 'water', 'lava', 'portal'],
  );
  assert.deepEqual(
    presets.filter((p) => p.category === 'fields').map((p) => p.force),
    forceCatalog.map((f) => f.kind),
  );
  for (const preset of presets.filter((p) => p.category === 'fields')) {
    const doc = place(freshDocument(), preset, { x: 0, y: 0 }).doc,
      force = doc.level.fields[0]!.force;
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(doc.level))), doc.level);
    assert.equal('params' in force, false);
    assert.equal('densityAt' in force, false);
    const value = forceDensity(force)({
      point: { x: 0.25, y: 0 },
      velocity: { x: 0, y: 0 },
      density: 1,
    });
    assert.ok(Number.isFinite(value.x) && Number.isFinite(value.y));
    const schema = forceCatalog.find((f) => f.kind === force.kind)!;
    assert.deepEqual(
      Object.keys(force)
        .filter((k) => k !== 'kind')
        .sort(),
      Object.keys(schema.parameters).sort(),
    );
  }
});

test('optional engine properties, prediction defaults and versioned snapshots survive authoring', async () => {
  const doc = edit(freshDocument(), (d) => {
    d.level.dynamicBodies[0]!.canSleep = false;
    d.level.dynamicBodies[0]!.angularVelocity = 1.2;
    d.level.dynamicBodies[0]!.linearVelocity = { x: 1, y: -2 };
    d.level.dynamicBodies[0]!.pieces[0]!.density = 2.5;
    d.level.prediction = { maxTicks: 6, sampleEveryTicks: 2 };
  });
  assert.deepEqual(decodeLevel(JSON.parse(JSON.stringify(encodeLevel(doc.level)))), doc.level);
  const game = await createGame(doc.level),
    newVersion = await createGame({ ...doc.level, version: 2 });
  try {
    const snapshot = game.snapshot();
    assert.equal(game.predict([]).finalSnapshot.tick, 6);
    assert.equal(game.snapshot().tick, 0);
    assert.throws(() => newVersion.restore(snapshot), /ID\/version/);
    game.step();
    game.restore(snapshot);
    assert.equal(game.getRenderState().tick, 0);
  } finally {
    game.destroy();
    newVersion.destroy();
  }
});

test('invalid format, unsupported properties, forces and source geometry are rejected', () => {
  const base = freshDocument();
  assert.throws(() => validateDocument({ version: 99 }), /Unsupported document version/);
  assert.throws(() => decodeLevel({ ...base.level, formatVersion: 99 }), /formatVersion/);
  assert.throws(() => decodeLevel({ ...base.level, newMechanic: 123 }), /not a known property/);
  assert.throws(() => decodeLevel({ ...base.level, gravity: { x: NaN, y: 0 } }), /finite/);
  assert.throws(
    () =>
      edit(base, (d) => {
        d.level.goal.bodyId = 'missing';
      }),
    /dynamic body/,
  );
  const force = place(
    base,
    presets.find((p) => p.force === 'attractor')!,
    { x: 0, y: 0 },
  ).doc;
  assert.throws(
    () =>
      decodeLevel({
        ...force.level,
        fields: [{ ...force.level.fields[0], force: { kind: 'vortex' } }],
      }),
    /force.kind/,
  );
  assert.throws(
    () =>
      edit(force, (d) => {
        const f = d.level.fields[0]!.force;
        if ('source' in f) f.source = { x: 99, y: 0 };
      }),
    /source must be inside/,
  );
  assert.throws(
    () =>
      edit(force, (d) => {
        const f = d.level.fields[0]!.force;
        if ('strength' in f) f.strength = Infinity;
      }),
    /finite/,
  );
  assert.throws(
    () =>
      edit(base, (d) => {
        d.level.dynamicBodies[0]!.pieces[0]!.shape = { kind: 'circle', radius: 0 };
      }),
    /positive/,
  );
});

test('bounds reject full geometry on placement, rotation, resizing, import and arena shrink', () => {
  const doc = freshDocument(),
    preset = presets.find((p) => p.id === 'staticBodies:rectangle')!;
  assert.throws(() => place(doc, preset, { x: 7.3, y: 0 }), /outside/);
  const { doc: placed, selection } = place(doc, preset, { x: 5, y: 0 });
  assert.throws(() => move(placed, selection, { x: 2, y: 0 }), /outside/);
  assert.throws(() => scaleObject(placed, selection, 10, 1), /outside/);
  assert.throws(
    () =>
      edit(placed, (d) => {
        const body = d.level.staticBodies.find((b) => b.id === selection.id)!;
        body.position.y = 4;
        body.angle = Math.PI / 2;
      }),
    /outside/,
  );
  assert.throws(
    () =>
      validateDocument({
        ...placed,
        level: { ...placed.level, goal: { ...placed.level.goal, minX: -10, maxX: 10 } },
      }),
    /Goal extends/,
  );
  const field = place(
    doc,
    presets.find((p) => p.category === 'fields')!,
    { x: 0, y: 0 },
  );
  assert.equal(field.doc.level.fields[0]!.enabled, false);
  assert.throws(() => move(field.doc, field.selection, { x: 20, y: 0 }), /outside/);
  const grown = resizeArena(doc, { minX: -10, maxX: 10, minY: -6, maxY: 6 });
  assert.deepEqual(grown.level.dynamicBodies, doc.level.dynamicBodies);
  assert.deepEqual(grown.level.goal, doc.level.goal);
  assert.deepEqual(
    grown.level.staticBodies.map((b) => b.id),
    doc.level.staticBodies.map((b) => b.id),
  );
  assert.throws(() => resizeArena(doc, { minX: -3, maxX: 3, minY: -3, maxY: 3 }), /outside/);
  const h = historyCommit({ past: [], present: doc, future: [] }, grown);
  assert.deepEqual(historyUndo(h).present, doc);
  assert.deepEqual(historyRedo(historyUndo(h)).present, grown);
});

test('rectangle edits preserve shape kinds until vertex editing; compound outlines use shared triangulation', async () => {
  const created = place(
    freshDocument(),
    presets.find((p) => p.id === 'dynamicBodies:rectangle')!,
    { x: 0, y: 0 },
  );
  const sized = scaleObject(created.doc, created.selection, 2, 1);
  assert.deepEqual(sized.level.dynamicBodies[1]!.pieces[0]!.shape, {
    kind: 'rectangle',
    width: 2,
    height: 1,
  });
  const vertex = edit(sized, (d) => {
    editablePolygon(d.level.dynamicBodies[1]!, 0)[0]!.x = -1.1;
  });
  assert.equal(vertex.level.dynamicBodies[1]!.pieces[0]!.shape.kind, 'polygon');
  const doc = setOutline(vertex, created.selection, [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
  ]);
  assert.ok(doc.level.dynamicBodies[1]!.pieces.length > 1);
  const copied = duplicate(doc, created.selection),
    game = await createGame(copied.doc.level);
  try {
    game.step();
    assert.equal(game.getRenderState().bodies.length, 3);
  } finally {
    game.destroy();
  }
});

test('repository saves canonical game JSON and sidecar, increments content versions, detects conflicts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'puttential-library-'));
  try {
    const doc = freshDocument(),
      saved = await saveLevel(doc, null, directory);
    assert.deepEqual((await loadLevel(doc.level.id, directory)).document, doc);
    const file = path.join(directory, `${doc.level.id}.json`),
      raw = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(parseLevel(raw), doc.level);
    assert.equal('editor' in raw, false);
    assert.equal('level' in raw, false);
    assert.equal('name' in raw, false);
    assert.deepEqual((await readdir(directory)).sort(), [
      `${doc.level.id}.editor.json`,
      `${doc.level.id}.json`,
    ]);
    const metadata = await saveLevel(
      edit(doc, (d) => {
        d.editor.name = 'Changed';
      }),
      saved.revision,
      directory,
    );
    assert.equal(metadata.document.level.version, 1);
    const changed = await saveLevel(
      edit(metadata.document, (d) => {
        d.level.gravity.y = -0.1;
      }),
      metadata.revision,
      directory,
    );
    assert.equal(changed.document.level.version, 2);
    assert.equal((await loadLevel(doc.level.id, directory)).document.level.version, 2);
    await assert.rejects(saveLevel(doc, saved.revision, directory), /changed on disk/);
    await assert.rejects(saveLevel(doc, null, directory), /already exists/);
    await assert.rejects(loadLevel('../escape', directory), /Level ID/);
    // An interrupted save or independent JSON edit cannot attach stale authoring metadata.
    await writeFile(file, JSON.stringify({ ...raw, version: 3 }));
    const external = await loadLevel(doc.level.id, directory);
    assert.match(external.warning, /changed independently/);
    assert.deepEqual(external.document.editor.arena.walls, []);
    assert.equal(external.document.level.version, 3);
    assert.deepEqual(await listLevels(directory), [doc.level.id]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('repository rejects symlinked level files', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'puttential-symlink-'));
  try {
    const doc = freshDocument();
    await saveLevel(doc, null, directory);
    try {
      await symlink(
        path.join(directory, `${doc.level.id}.json`),
        path.join(directory, 'linked.json'),
      );
    } catch (error: any) {
      if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        t.skip(
          'Windows requires Developer Mode or symlink privilege; Linux CI exercises this security assertion.',
        );
        return;
      }
      throw error;
    }
    await assert.rejects(loadLevel('linked', directory), /regular files/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy documents migrate supported data without changing original files or approximating circles', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'puttential-legacy-'));
  try {
    const doc = place(
      freshDocument(),
      presets.find((p) => p.force === 'uniform')!,
      { x: 0, y: 0 },
    ).doc;
    const legacy = legacyDocument(doc),
      text = JSON.stringify(legacy),
      file = path.join(directory, `${doc.level.id}.puttential.json`);
    await writeFile(file, text);
    const loaded = await loadLevel(doc.level.id, directory);
    assert.match(loaded.warning, /Legacy/);
    assert.equal(loaded.document.editor.name, doc.editor.name);
    assert.equal(loaded.document.level.dynamicBodies[0]!.pieces[0]!.shape.kind, 'polygon');
    assert.deepEqual(loaded.document.level.fields[0]!.force, doc.level.fields[0]!.force);
    await saveLevel(loaded.document, loaded.revision, directory);
    assert.equal(await readFile(file, 'utf8'), text);
    assert.deepEqual(await listLevels(directory), [doc.level.id]);
    const bad = {
      ...legacy,
      level: {
        ...legacy.level,
        fields: [{ ...legacy.level.fields[0], force: { kind: 'vortex', params: { strength: 1 } } }],
      },
    };
    assert.throws(() => validateDocument(bad), /not supported by the current game engine/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('shared frontend goal tracking counts every engine tick and resets interrupted holds', () => {
  const goal = { bodyId: 'ball', minX: -1, maxX: 1, minY: -1, maxY: 1, holdSeconds: 3 * FIXED_DT };
  const frame = levelFrame(freshDocument().level);
  const state = (tick: number, x: number): RenderState => ({
    ...frame,
    tick,
    bodies: frame.bodies.map((b) => ({ ...b, position: { x, y: 0 } })),
  });
  let progress = initialGoal(goal);
  progress = advanceGoal(progress, state(1, 0));
  progress = advanceGoal(progress, state(2, 0));
  assert.equal(progress.completedTick, null);
  assert.equal(advanceGoal(progress, state(2, 0)), progress);
  progress = advanceGoal(progress, state(3, 2));
  assert.equal(progress.heldTicks, 0);
  for (let tick = 4; tick <= 6; tick++) progress = advanceGoal(progress, state(tick, 0));
  assert.equal(progress.completedTick, 6);
  assert.equal(advanceGoal(progress, state(7, 2)).completedTick, 6);
  assert.equal(initialGoal(goal).heldTicks, 0);
  assert.equal(advanceGoal(initialGoal({ ...goal, holdSeconds: 0 }), state(1, 0)).completedTick, 1);
});
