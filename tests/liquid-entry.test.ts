import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGame, transformPolygon, rectangle } from '../src/game';
import type { FieldForceDefinition, Vec2 } from '../src/game';
import { centerZoneEntry } from '../src/game/objects/zones';
import { freshDocument } from '../level-editor/editor/model';

function liquidLevel(kind: 'water' | 'lava', position: Vec2, velocity: Vec2) {
  const base = freshDocument().level;
  const force: FieldForceDefinition =
    kind === 'water' ? { kind, drag: 12, sinkSpeed: 0.06 } : { kind };
  return {
    ...base,
    staticBodies: [],
    dynamicBodies: [{ ...base.dynamicBodies[0]!, position, linearVelocity: velocity }],
    fields: [
      {
        id: 'liquid',
        position: { x: 0, y: 0 },
        angle: 0,
        enabled: true,
        shape: { kind: 'rectangle' as const, width: 2, height: 2 },
        force,
      },
    ],
  };
}

test('liquid edge grazes neither slow nor burn a ball whose center stays outside', async () => {
  for (const kind of ['water', 'lava'] as const)
    for (const x of [1.01, 1.2, 1.39, 1.41]) {
      const game = await createGame(liquidLevel(kind, { x, y: -0.5 }, { x: 0, y: 2 }));
      try {
        for (let i = 0; i < 30; i++) game.step();
        const ball = game.getRenderState().bodies[0]!;
        assert.equal(ball.burnt, false, `${kind} must ignore a grazing rim at x=${x}`);
        assert.equal(ball.destroyed, undefined);
        assert.equal(ball.submerged, false);
        assert.deepEqual(ball.linearVelocity, { x: 0, y: 2 });
      } finally {
        game.destroy();
      }
    }
});

test('water starts slowing on center entry, while sinking still requires full submersion', async () => {
  const game = await createGame(liquidLevel('water', { x: 0.99, y: 0 }, { x: 0, y: 2 }));
  try {
    for (let i = 0; i < 12; i++) game.step();
    const ball = game.getRenderState().bodies[0]!;
    assert.ok(ball.linearVelocity.y < 1.5);
    assert.equal(ball.submerged, true);
    assert.equal(ball.destroyed, undefined);
  } finally {
    game.destroy();
  }
});

test('lava allows the leading rim to enter and burns precisely when the center reaches the boundary', async () => {
  const game = await createGame(liquidLevel('lava', { x: 1.6, y: 0 }, { x: -3, y: 0 }));
  try {
    for (let i = 0; i < 12; i++) game.step();
    assert.ok(game.getRenderState().bodies[0]!.position.x < 1.4, 'the rim is visibly inside');
    assert.equal(game.getRenderState().bodies[0]!.burnt, false);
    const snapshot = game.snapshot();
    for (let i = 0; i < 20; i++) game.step();
    const burnt = game.getRenderState();
    assert.equal(burnt.bodies[0]!.burnt, true);
    assert.ok(Math.abs(burnt.bodies[0]!.position.x - 1) < 1e-6);
    assert.deepEqual(burnt.bodies[0]!.linearVelocity, { x: 0, y: 0 });
    game.restore(snapshot);
    for (let i = 0; i < 20; i++) game.step();
    assert.deepEqual(game.getRenderState(), burnt);
  } finally {
    game.destroy();
  }
});

test('fast lava crossings use the center path, ignoring rim-only passes and catching thin zones', async () => {
  for (const y of [0, 1.01, 1.2]) {
    const level = liquidLevel('lava', { x: -1.2, y }, { x: 300, y: 0 });
    level.fields[0]!.shape.width = 0.02;
    const game = await createGame(level);
    try {
      game.step();
      const ball = game.getRenderState().bodies[0]!;
      assert.equal(ball.burnt, y === 0);
      if (y === 0) assert.ok(Math.abs(ball.position.x + 0.01) < 1e-6);
      else assert.equal(ball.linearVelocity.x, 300);
    } finally {
      game.destroy();
    }
  }
});

test('liquids use the physical center of offset shapes rather than the authored origin', async () => {
  for (const kind of ['water', 'lava'] as const)
    for (const inside of [false, true]) {
      const level = liquidLevel(kind, { x: inside ? 2 : 0, y: 0 }, { x: 0, y: 2 });
      const offset = inside ? -1.2 : 1.2;
      const points = rectangle(1, 0.4).map((p) => ({ x: p.x + offset, y: p.y }));
      const game = await createGame({
        ...level,
        dynamicBodies: [
          {
            ...level.dynamicBodies[0]!,
            pieces: [{ id: 'offset-piece', shape: { kind: 'polygon', points } }],
          },
        ],
      });
      try {
        for (let i = 0; i < 4; i++) game.step();
        const body = game.getRenderState().bodies[0]!;
        assert.equal(body.burnt, kind === 'lava' && inside);
        assert.equal(body.submerged, inside);
        assert.equal(body.linearVelocity.y < 2, inside);
      } finally {
        game.destroy();
      }
    }
});

test('center entry handles rotated and concave outlines without treating their bounds as liquid', () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 3 },
    { x: 0, y: 3 },
  ];
  assert.equal(centerZoneEntry({ x: 2, y: 2 }, { x: 3, y: 2 }, polygon), null);
  assert.equal(centerZoneEntry({ x: -1, y: 2 }, { x: 3, y: 2 }, polygon), 0.25);
  assert.equal(centerZoneEntry({ x: -1, y: 0 }, { x: 4, y: 0 }, polygon), 0.2);
  const position = { x: 4, y: -2 },
    angle = 0.7;
  const rotated = transformPolygon(polygon, position, angle);
  const [start, end] = transformPolygon(
    [
      { x: -1, y: 2 },
      { x: 3, y: 2 },
    ],
    position,
    angle,
  );
  assert.ok(Math.abs(centerZoneEntry(start!, end!, rotated)! - 0.25) < 1e-10);
});

test('tiny or stationary motion outside a liquid does not falsely intersect its boundary', () => {
  const polygon = rectangle(2, 2);
  assert.equal(centerZoneEntry({ x: 0, y: 1.0001 }, { x: 1e-10, y: 1.0001 }, polygon), null);
  assert.equal(centerZoneEntry({ x: 1.2, y: 0 }, { x: 1.2, y: 0 }, polygon), null);
});
