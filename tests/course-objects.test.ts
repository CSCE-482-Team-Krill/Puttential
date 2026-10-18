import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGame, parseLevel, FIXED_DT } from '../src/game';
import type { FieldForceDefinition, Level, Vec2 } from '../src/game';
import { freshDocument, place, presets } from '../level-editor/editor/model';
import { advanceGoal, initialGoal } from '../src/frontend/goal-progress';

function level(
  force: FieldForceDefinition,
  position: Vec2 = { x: 0, y: 0 },
  velocity: Vec2 = { x: 2, y: 0 },
): Level {
  const base = freshDocument().level;
  return parseLevel({
    ...base,
    staticBodies: [],
    dynamicBodies: [{ ...base.dynamicBodies[0], position, linearVelocity: velocity }],
    fields: [
      {
        id: 'zone',
        position: { x: 0, y: 0 },
        angle: 0,
        enabled: true,
        shape: { kind: 'rectangle', width: 4, height: 4 },
        force,
      },
    ],
  });
}

test('water: slows moving bodies, sinks only fully submerged resting bodies, and restores deterministically', async () => {
  const game = await createGame(level({ kind: 'water', drag: 12, sinkSpeed: 0.06 }));
  try {
    const initial = game.snapshot();
    const initialState = game.getRenderState();
    game.restore(initial);
    assert.deepEqual(game.getRenderState(), initialState);
    for (let i = 0; i < 12; i++) game.step();
    assert.ok(game.getRenderState().bodies[0]!.linearVelocity.x < 1);
    assert.equal(game.getRenderState().bodies[0]!.submerged, true);
    for (let i = 0; i < 120; i++) game.step();
    const final = game.getRenderState();
    assert.equal(final.bodies[0]!.destroyed, 'water');
    game.restore(initial);
    for (let i = 0; i < 132; i++) game.step();
    assert.deepEqual(game.getRenderState(), final);
    const failed = game.snapshot();
    game.restore(failed);
    assert.equal(game.getRenderState().bodies[0]!.destroyed, 'water');
  } finally {
    game.destroy();
  }
  for (const x of [1.8, 2.2, 3]) {
    const shore = await createGame(
      level({ kind: 'water', drag: 12, sinkSpeed: 0.06 }, { x, y: 0 }, { x: 0, y: 0 }),
    );
    try {
      shore.step();
      assert.equal(shore.getRenderState().bodies[0]!.destroyed, undefined);
    } finally {
      shore.destroy();
    }
  }
  const placed = place(
    freshDocument(),
    presets.find((p) => p.id === 'fields:water')!,
    { x: 0, y: 0 },
  );
  assert.equal(placed.doc.level.fields[0]!.enabled, true);
  assert.throws(
    () =>
      parseLevel({
        ...placed.doc.level,
        fields: [
          { ...placed.doc.level.fields[0], force: { kind: 'water', drag: -1, sinkSpeed: 0.06 } },
        ],
      }),
    /water drag/,
  );
});

test('lava: any contact fails, including grazing and fast crossings; a burnt ball cannot score', async () => {
  for (const [x, vx] of [
    [0, 0],
    [2.39, 0],
    [-3, 900],
  ]) {
    const game = await createGame(level({ kind: 'lava' }, { x: x!, y: 0 }, { x: vx!, y: 0 }));
    try {
      game.step();
      const state = game.getRenderState();
      assert.equal(state.bodies[0]!.burnt, true);
      assert.equal(state.bodies[0]!.destroyed, undefined);
      assert.deepEqual(state.bodies[0]!.linearVelocity, { x: 0, y: 0 });
      assert.equal(state.bodies[0]!.angularVelocity, 0);
      const goal = { ...freshDocument().level.goal, minX: -10, maxX: 10, holdSeconds: 0 };
      assert.equal(advanceGoal(initialGoal(goal), state).completedTick, null);
      const failed = game.snapshot();
      game.restore(failed);
      game.step();
      assert.equal(game.getRenderState().bodies[0]!.burnt, true);
      assert.deepEqual(game.getRenderState().bodies[0]!.linearVelocity, { x: 0, y: 0 });
    } finally {
      game.destroy();
    }
  }
  const safe = await createGame(level({ kind: 'lava' }, { x: 2.41, y: 0 }, { x: 0, y: 0 }));
  try {
    safe.step();
    assert.equal(safe.getRenderState().bodies[0]!.destroyed, undefined);
  } finally {
    safe.destroy();
  }
  const placed = place(
    freshDocument(),
    presets.find((p) => p.id === 'fields:lava')!,
    { x: 0, y: 0 },
  );
  assert.equal(placed.doc.level.fields[0]!.force.kind, 'lava');
});

test('portals: paired placement, velocity preservation/rotation, lockout, and snapshot replay', async () => {
  const placed = place(
    freshDocument(),
    presets.find((p) => p.id === 'fields:portal')!,
    { x: -1, y: 0 },
  );
  assert.equal(placed.doc.level.fields.length, 2);
  assert.deepEqual(placed.doc.level.fields[0]!.force, placed.doc.level.fields[1]!.force);
  for (const rotateVelocity of [false, true]) {
    const base = level(
      { kind: 'portal', pairId: 'pair', rotateVelocity, delaySeconds: 0.25, cooldownSeconds: 0.75 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    );
    const entry = base.fields[0]!;
    const game = await createGame({
      ...base,
      fields: [entry, { ...entry, id: 'exit', angle: Math.PI / 2, position: { x: 6, y: 0 } }],
    });
    try {
      game.step();
      assert.equal(game.getRenderState().bodies[0]!.teleporting, true);
      assert.equal(game.getRenderState().bodies[0]!.sleeping, false);
      assert.equal(game.getRenderState().bodies[0]!.position.x, 0);
      const waiting = game.snapshot();
      for (let i = 0; i < 29; i++) game.step();
      const emergence = game.getRenderState();
      game.restore(waiting);
      for (let i = 0; i < 29; i++) game.step();
      assert.deepEqual(
        game.getRenderState(),
        emergence,
        'snapshot resumes the exact pending transfer',
      );
      const first = game.getRenderState().bodies[0]!;
      assert.equal(first.teleporting, false);
      assert.ok(first.position.x > 5.9);
      assert.ok(Math.abs(first.linearVelocity[rotateVelocity ? 'y' : 'x'] - 2) < 1e-5);
      const snapshot = game.snapshot();
      game.step();
      const second = game.getRenderState();
      assert.ok(second.bodies[0]!.position.x > 5.9, 'does not bounce back inside the exit');
      game.restore(snapshot);
      game.step();
      assert.deepEqual(game.getRenderState(), second);
      for (let i = 0; i < 300; i++) game.step();
      assert.ok(
        game.getRenderState().bodies[0]!.position.x > 5.9,
        'leaving the exit must not teleport back',
      );
      assert.throws(
        () =>
          game.queueCommand({
            type: 'set-field-enabled',
            fieldId: 'zone',
            enabled: false,
            sequence: 1,
          }),
        /fixed during play/,
      );
    } finally {
      game.destroy();
    }
  }
  assert.throws(
    () =>
      parseLevel({
        ...placed.doc.level,
        fields: [...placed.doc.level.fields, { ...placed.doc.level.fields[0], id: 'third' }],
      }),
    /at most two/,
  );
  assert.throws(
    () =>
      place(
        freshDocument(),
        presets.find((p) => p.id === 'fields:portal')!,
        { x: 6, y: 0 },
      ),
    /outside the board/,
  );
});

test('fast portal crossings resolve before later lava, but a hazardous exit still fails', async () => {
  const base = level(
    {
      kind: 'portal',
      pairId: 'pair',
      rotateVelocity: false,
      delaySeconds: 0.25,
      cooldownSeconds: 0.75,
    },
    { x: -3, y: 0 },
    { x: 900, y: 0 },
  );
  const entry = {
    ...base.fields[0]!,
    shape: { kind: 'rectangle' as const, width: 0.1, height: 2 },
  };
  const exit = { ...entry, id: 'exit', position: { x: 10, y: 0 } };
  const lava = { ...entry, id: 'lava', position: { x: 2, y: 0 }, force: { kind: 'lava' as const } };
  for (const hazardousExit of [false, true]) {
    const game = await createGame({
      ...base,
      fields: [entry, exit, { ...lava, position: hazardousExit ? exit.position : lava.position }],
    });
    try {
      game.step();
      assert.equal(game.getRenderState().bodies[0]!.teleporting, true);
      for (let i = 0; i < 30; i++) game.step();
      assert.ok(game.getRenderState().bodies[0]!.position.x > 9);
      assert.equal(game.getRenderState().bodies[0]!.burnt, hazardousExit);
    } finally {
      game.destroy();
    }
  }
});

test('portal cooldown blocks an immediate physical return, and a stationary exit cannot loop', async () => {
  const base = level(
    {
      kind: 'portal',
      pairId: 'pair',
      rotateVelocity: false,
      delaySeconds: 0.1,
      cooldownSeconds: 0.75,
    },
    { x: 0, y: 0 },
    { x: 8, y: 0 },
  );
  const entry = {
    ...base.fields[0]!,
    shape: { kind: 'rectangle' as const, width: 0.6, height: 2 },
  };
  const exit = { ...entry, id: 'exit', position: { x: 6, y: 0 } };
  const obstacle = {
    id: 'bounce-wall',
    position: { x: 7.4, y: 0 },
    angle: 0,
    material: { restitution: 1 },
    pieces: [{ id: 'wall-piece', shape: { kind: 'rectangle' as const, width: 0.2, height: 3 } }],
  };
  const game = await createGame({ ...base, staticBodies: [obstacle], fields: [entry, exit] });
  try {
    for (let i = 0; i < 12; i++) game.step();
    const cooldown = game.snapshot();
    assert.equal(game.getRenderState().bodies[0]!.position.x, 6);
    assert.ok(cooldown.portalCooldowns!.ball! > game.getRenderState().tick);
    for (let i = 0; i < 40; i++) {
      game.step();
      assert.equal(
        game.getRenderState().bodies[0]!.teleporting,
        false,
        'return during cooldown is ignored',
      );
      assert.ok(game.getRenderState().bodies[0]!.position.x > 4);
    }
    const bounced = game.getRenderState();
    game.restore(cooldown);
    for (let i = 0; i < 40; i++) game.step();
    assert.deepEqual(game.getRenderState(), bounced, 'cooldown survives restore');
  } finally {
    game.destroy();
  }
  const resting = await createGame({
    ...base,
    fields: [entry, exit],
    dynamicBodies: [{ ...base.dynamicBodies[0]!, linearVelocity: { x: 0, y: 0 } }],
  });
  try {
    for (let i = 0; i < 500; i++) resting.step();
    assert.equal(resting.getRenderState().bodies[0]!.position.x, 6);
    assert.equal(resting.getRenderState().bodies[0]!.teleporting, false);
  } finally {
    resting.destroy();
  }
});

test('portal defaults remain compatible with older JSON; timing inputs are validated', () => {
  const old = level({ kind: 'portal', pairId: 'old-pair', rotateVelocity: false });
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(old))), old);
  for (const property of ['delaySeconds', 'cooldownSeconds'])
    for (const value of [-1, 0, 100, NaN]) {
      assert.throws(() =>
        level({ kind: 'portal', pairId: 'pair', rotateVelocity: false, [property]: value }),
      );
    }
});

test('waiting portals skip sweeps, and broadphase rejects distant portals before shape casting', async () => {
  const { default: RAPIER } = await import('@dimforge/rapier2d-compat');
  const original = RAPIER.Shape.prototype.castShape;
  let casts = 0;
  RAPIER.Shape.prototype.castShape = function (...args) {
    casts++;
    return original.apply(this, args);
  };
  const base = level(
    { kind: 'portal', pairId: 'pair', rotateVelocity: false, delaySeconds: 1, cooldownSeconds: 1 },
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  );
  const entry = base.fields[0]!,
    exit = { ...entry, id: 'exit', position: { x: 10, y: 0 } };
  const game = await createGame({ ...base, fields: [entry, exit] });
  try {
    game.step();
    casts = 0;
    for (let i = 0; i < 60; i++) game.step();
    assert.equal(game.getRenderState().bodies[0]!.teleporting, true);
    assert.equal(casts, 0);
    const predicted = game.predict([], { maxTicks: 60 });
    assert.ok(predicted.ticksSimulated >= 59, 'prediction waits for the pending portal');
    assert.ok(predicted.finalState.bodies[0]!.position.x >= 10);
    const far = await createGame({
      ...base,
      fields: [
        { ...entry, position: { x: 100, y: 0 } },
        { ...exit, position: { x: 110, y: 0 } },
      ],
    });
    try {
      casts = 0;
      for (let i = 0; i < 30; i++) far.step();
      assert.equal(casts, 0);
    } finally {
      far.destroy();
    }
  } finally {
    game.destroy();
    RAPIER.Shape.prototype.castShape = original;
  }
});
