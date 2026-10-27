import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createGame,
  parseLevel,
  levelBounds,
  resizeArena,
  setLevelBorders,
  validateDocument,
  rectangle,
} from '../src/game';
import type { Level, PieceShape, Vec2 } from '../src/game';
import {
  freshDocument,
  edit,
  historyCommit,
  historyUndo,
  historyRedo,
} from '../level-editor/editor/model';
import { resolveBodyPieces } from '../src/game/objects/bodies';
import { bodyTouchesBounds } from '../src/game/objects/bounds';
import { saveLevel, loadLevel } from '../level-editor/editor/library';
import { advanceGoal, initialGoal } from '../src/frontend/goal-progress';

const bounds = { minX: -2, maxX: 2, minY: -2, maxY: 2 };
function course(position: Vec2 = { x: 0, y: 0 }, velocity: Vec2 = { x: 0, y: 0 }): Level {
  const base = freshDocument().level;
  return parseLevel({
    ...base,
    bounds,
    staticBodies: [],
    fields: [],
    dynamicBodies: [{ ...base.dynamicBodies[0], position, linearVelocity: velocity }],
    goal: { ...base.goal, minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, holdSeconds: 1 },
  });
}
function touches(shapes: readonly PieceShape[], position: Vec2, angle = 0) {
  const body = {
    ...course().dynamicBodies[0]!,
    pieces: shapes.map((shape, i) => ({ id: `piece-${i}`, shape })),
  };
  return bodyTouchesBounds(resolveBodyPieces(body), position, angle, bounds);
}

test('border toggle removes only managed walls, preserves the board, and undoes atomically', () => {
  const initial = freshDocument();
  const withObstacle = edit(initial, (d) => {
    d.level.staticBodies.push({
      id: 'obstacle',
      position: { x: 0, y: 0 },
      angle: 0,
      material: { restitution: 0.8 },
      pieces: [{ id: 'obstacle-piece', shape: { kind: 'rectangle', width: 1, height: 1 } }],
    });
  });
  const open = setLevelBorders(withObstacle, false);
  assert.deepEqual(open.editor.arena.walls, []);
  assert.deepEqual(
    open.level.staticBodies.map((b) => b.id),
    ['obstacle'],
  );
  assert.deepEqual(open.level.bounds, initial.editor.arena.bounds);
  assert.deepEqual(levelBounds(open.level), initial.editor.arena.bounds);
  const history = historyCommit({ past: [], present: withObstacle, future: [] }, open);
  assert.deepEqual(historyUndo(history).present, withObstacle);
  assert.deepEqual(historyRedo(historyUndo(history)).present, open);
  const closed = setLevelBorders(open, true);
  assert.equal(closed.editor.arena.walls.length, 4);
  assert.equal(closed.level.staticBodies.length, 5);
  assert.deepEqual(setLevelBorders(closed, true), closed);
  assert.deepEqual(setLevelBorders(closed, false), open);
});

test('enabling borders avoids collisions with existing object IDs and resizing preserves open bounds', () => {
  const open = setLevelBorders(freshDocument(), false);
  const custom = edit(open, (d) => {
    d.level.fields.push({
      id: 'left-rail',
      position: { x: 0, y: 0 },
      angle: 0,
      enabled: false,
      shape: { kind: 'rectangle', width: 1, height: 1 },
      force: { kind: 'uniform', density: { x: 1, y: 0 } },
    });
  });
  const closed = setLevelBorders(custom, true);
  assert.equal(closed.editor.arena.walls[0], 'left-rail-1');
  assert.equal(closed.level.fields[0]!.id, 'left-rail');
  const resized = resizeArena(open, { minX: -10, maxX: 10, minY: -6, maxY: 6 });
  assert.deepEqual(resized.level.bounds, resized.editor.arena.bounds);
  assert.equal(resized.level.staticBodies.length, 0);
  assert.deepEqual(
    validateDocument(JSON.parse(JSON.stringify(resized.level))).editor.arena.bounds,
    resized.editor.arena.bounds,
  );
  assert.equal(setLevelBorders(resized, true).level.staticBodies.length, 4);
});

test('open board bounds survive repository save/reopen and bare game JSON import', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'puttential-open-board-'));
  try {
    const open = resizeArena(setLevelBorders(freshDocument(), false), {
      minX: -10,
      maxX: 10,
      minY: -6,
      maxY: 6,
    });
    const saved = await saveLevel(open, null, directory);
    const raw = JSON.parse(await readFile(path.join(directory, `${open.level.id}.json`), 'utf8'));
    assert.deepEqual(raw.bounds, open.editor.arena.bounds);
    assert.equal(raw.staticBodies.length, 0);
    assert.deepEqual((await loadLevel(open.level.id, directory)).document, saved.document);
    const imported = validateDocument(raw);
    assert.deepEqual(imported.editor.arena.bounds, open.editor.arena.bounds);
    assert.equal(imported.editor.arena.walls.length, 0);
    assert.deepEqual(parseLevel(raw), open.level);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runtime permits circular overhang and tangent contact on every side, but fails complete exits', async () => {
  for (const axis of ['x', 'y'] as const)
    for (const sign of [-1, 1])
      for (const distance of [2.2, 2.4, 2.401]) {
        const position = { x: 0, y: 0 };
        position[axis] = sign * distance;
        const game = await createGame(course(position));
        try {
          game.step();
          assert.equal(
            !!game.getRenderState().failure,
            distance > 2.4,
            `${axis}: ${sign * distance}`,
          );
        } finally {
          game.destroy();
        }
      }
});

test('actual circle and rotated polygon geometry decide corner overlap, not bounding boxes', () => {
  assert.equal(touches([{ kind: 'circle', radius: 0.4 }], { x: 2.2, y: 2.2 }), true);
  assert.equal(touches([{ kind: 'circle', radius: 0.4 }], { x: 2.3, y: 2.3 }), false);
  const square = { kind: 'rectangle' as const, width: 1, height: 1 };
  assert.equal(touches([square], { x: 2.3, y: 2.3 }, Math.PI / 4), true);
  assert.equal(touches([square], { x: 2.5, y: 2.5 }, Math.PI / 4), false);
});

test('compound bodies remain in play while any piece overlaps, even with the origin outside', () => {
  const shape = (x: number): PieceShape => ({
    kind: 'polygon',
    points: rectangle(0.4, 0.4).map((p) => ({ x: p.x + x, y: p.y })),
  });
  assert.equal(touches([shape(-3), shape(3)], { x: 0, y: 0 }), false);
  assert.equal(touches([shape(-3), shape(1.9)], { x: 0, y: 0 }), true);
  assert.equal(touches([shape(-2)], { x: 3, y: 0 }), true);
});

test('any moving object leaving fails the run, prevents a goal, freezes the tick and restores deterministically', async () => {
  const base = course();
  const level = {
    ...base,
    dynamicBodies: [
      ...base.dynamicBodies,
      {
        ...base.dynamicBodies[0]!,
        id: 'escaping',
        position: { x: 1.8, y: 0 },
        linearVelocity: { x: 8, y: 0 },
        pieces: [{ id: 'escaping-piece', shape: { kind: 'circle' as const, radius: 0.4 } }],
      },
    ],
  };
  const game = await createGame(level);
  try {
    const setup = game.snapshot();
    const predicted = game.predict([], { maxTicks: 120, sampleEveryTicks: 1 });
    assert.deepEqual(predicted.finalState.failure, { reason: 'out-of-bounds', bodyId: 'escaping' });
    assert.ok(predicted.ticksSimulated > 1 && predicted.ticksSimulated < 120);
    for (let i = 0; i < 120; i++) game.step();
    const failed = game.getRenderState();
    assert.deepEqual(failed, predicted.finalState);
    assert.equal(advanceGoal(initialGoal(level.goal), failed).completedTick, null);
    const final = game.snapshot();
    game.restore(final);
    game.step();
    assert.deepEqual(game.getRenderState(), failed);
    assert.equal(game.predict([]).ticksSimulated, 0);
    game.restore(setup);
    assert.equal(game.getRenderState().failure, undefined);
    for (let i = 0; i < 120; i++) game.step();
    assert.deepEqual(game.getRenderState(), failed);
  } finally {
    game.destroy();
  }
});

test('bounds validate positive finite dimensions and old JSON remains losslessly supported', () => {
  const legacy = freshDocument().level;
  assert.equal(legacy.bounds, undefined);
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(legacy))), legacy);
  assert.deepEqual(levelBounds(legacy), freshDocument().editor.arena.bounds);
  for (const bad of [
    { ...bounds, maxX: bounds.minX },
    { ...bounds, minY: NaN },
    { ...bounds, maxY: Infinity },
  ])
    assert.throws(() => parseLevel({ ...legacy, bounds: bad }), /bounds/);
});
