import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGame, parseLevel } from '../src/game';
import type { FieldZoneDefinition, Game, Level, SoundEvent, Vec2 } from '../src/game';
import { freshDocument } from '../level-editor/editor/model';

/** The fresh editor board: a 0.4 ball inside walls whose inner faces sit at x = ±6.9, y = ±3.75. */
function scene(
  velocity: Vec2,
  {
    position = { x: -4, y: 0 },
    fields = [],
    extraBall,
  }: { position?: Vec2; fields?: FieldZoneDefinition[]; extraBall?: Vec2 } = {},
): Level {
  const base = freshDocument().level;
  const ball = base.dynamicBodies[0]!;
  return parseLevel({
    ...base,
    dynamicBodies: [
      { ...ball, position, linearVelocity: velocity },
      ...(extraBall ? [{ ...ball, id: 'ball-2', position: extraBall }] : []),
    ],
    fields,
  });
}

function zone(
  id: string,
  force: FieldZoneDefinition['force'],
  position: Vec2,
): FieldZoneDefinition {
  return {
    id,
    position,
    angle: 0,
    enabled: true,
    shape: { kind: 'rectangle', width: 2, height: 2 },
    force,
  };
}

type Logged = SoundEvent & { tick: number };
function run(game: Game, ticks: number): Logged[] {
  const log: Logged[] = [];
  for (let i = 0; i < ticks; i++) {
    game.step();
    for (const event of game.soundEvents())
      log.push({ ...event, tick: game.getRenderState().tick });
  }
  return log;
}

test('events are opt-in and never change the simulation', async () => {
  const levels = [
    scene({ x: 5, y: 2 }),
    scene({ x: 5, y: 0 }, { extraBall: { x: 0, y: 0 } }),
    scene(
      { x: 3, y: 0 },
      { fields: [zone('pool', { kind: 'water', drag: 0.5, sinkSpeed: 0.06 }, { x: 0, y: 0 })] },
    ),
  ];
  for (const level of levels) {
    const on = await createGame(level, { soundEvents: true });
    const off = await createGame(level);
    try {
      let emitted = 0;
      for (let i = 0; i < 900; i++) {
        on.step();
        off.step();
        emitted += on.soundEvents().length;
        assert.equal(off.soundEvents().length, 0);
      }
      assert.ok(emitted > 0);
      assert.deepEqual(on.getRenderState(), off.getRenderState());
      assert.deepEqual(on.snapshot(), off.snapshot());
    } finally {
      on.destroy();
      off.destroy();
    }
  }
});

test('impacts: one event per wall hit with the closing speed, none while resting', async () => {
  const game = await createGame(scene({ x: 5, y: 0 }), { soundEvents: true });
  try {
    const impacts = run(game, 1200).filter((e) => e.kind === 'impact');
    assert.ok(impacts.length >= 3, `expected repeated bounces, saw ${impacts.length}`);
    const [first, second] = impacts as Extract<Logged, { kind: 'impact' }>[];
    assert.equal(first!.otherId, null);
    assert.ok(Math.abs(first!.speed - 5) < 0.1, `first hit speed ${first!.speed}`);
    assert.ok(first!.point.x > 6.8, 'hit lands on the right wall');
    assert.ok(Math.abs(second!.speed - 4) < 0.15, 'restitution 0.8 slows the return hit');
    assert.ok(second!.point.x < -6.8, 'second hit lands on the left wall');
    for (let i = 1; i < impacts.length; i++)
      assert.ok(impacts[i]!.tick - impacts[i - 1]!.tick > 30, 'no chatter within a single bounce');
  } finally {
    game.destroy();
  }
});

test('impacts between bodies are reported once per pair', async () => {
  const game = await createGame(scene({ x: 5, y: 0 }, { extraBall: { x: 0, y: 0 } }), {
    soundEvents: true,
  });
  try {
    const first = run(game, 120).find((e) => e.kind === 'impact');
    assert.ok(first && first.kind === 'impact');
    assert.deepEqual([first.bodyId, first.otherId], ['ball', 'ball-2']);
    assert.ok(Math.abs(first.speed - 5) < 0.1);
    assert.equal(run(game, 0).length, 0);
  } finally {
    game.destroy();
  }
});

test('restore replays identical events and does not re-announce resting state', async () => {
  const game = await createGame(scene({ x: 5, y: 2 }), { soundEvents: true });
  try {
    const initial = game.snapshot();
    const first = run(game, 600);
    game.restore(initial);
    assert.equal(game.soundEvents().length, 0);
    assert.deepEqual(run(game, 600), first);
  } finally {
    game.destroy();
  }
  // A ball already in water at creation or restore is not a new splash.
  const pool = scene(
    { x: 0, y: 0 },
    {
      position: { x: 0, y: 0 },
      fields: [zone('pool', { kind: 'water', drag: 12, sinkSpeed: 0.06 }, { x: 0, y: 0 })],
    },
  );
  const sinking = await createGame(pool, { soundEvents: true });
  try {
    const log = run(sinking, 30);
    assert.deepEqual(
      log.map((e) => e.kind),
      ['water-sink'],
    );
  } finally {
    sinking.destroy();
  }
});

test('water, lava and portal transitions', async () => {
  const water = await createGame(
    scene(
      { x: 3, y: 0 },
      { fields: [zone('pool', { kind: 'water', drag: 0.5, sinkSpeed: 0.06 }, { x: 0, y: 0 })] },
    ),
    { soundEvents: true },
  );
  try {
    const log = run(water, 300).filter((e) => e.kind !== 'impact');
    assert.deepEqual(
      log.map((e) => e.kind),
      ['water-enter', 'water-exit'],
    );
    const enter = log[0]!;
    assert.ok(enter.kind === 'water-enter' && Math.abs(enter.speed - 3) < 0.1);
  } finally {
    water.destroy();
  }

  const lava = await createGame(
    scene({ x: 3, y: 0 }, { fields: [zone('pit', { kind: 'lava' }, { x: 0, y: 0 })] }),
    { soundEvents: true },
  );
  try {
    assert.deepEqual(
      run(lava, 300).map((e) => e.kind),
      ['lava-burn'],
    );
  } finally {
    lava.destroy();
  }

  const portal = {
    kind: 'portal',
    pairId: 'pair',
    rotateVelocity: false,
    delaySeconds: 0.25,
    cooldownSeconds: 0.75,
  } as const;
  const portals = await createGame(
    scene(
      { x: 3, y: 0 },
      {
        fields: [zone('in', portal, { x: -1, y: 0 }), zone('out', portal, { x: 4, y: 2.5 })],
      },
    ),
    { soundEvents: true },
  );
  try {
    const log = run(portals, 200).filter((e) => e.kind !== 'impact');
    assert.deepEqual(
      log.map((e) => [e.kind, 'portalId' in e ? e.portalId : null]),
      [
        ['portal-enter', 'in'],
        ['portal-exit', 'out'],
      ],
    );
    assert.equal(log[1]!.tick - log[0]!.tick, 30, 'exit follows the 0.25s transfer');
  } finally {
    portals.destroy();
  }
});

test('predictions do not touch the recorded events', async () => {
  const game = await createGame(scene({ x: 5, y: 0 }), { soundEvents: true });
  try {
    while (!game.soundEvents().length) game.step();
    const events = game.soundEvents();
    game.predict([], { maxTicks: 600 });
    assert.equal(game.soundEvents(), events);
  } finally {
    game.destroy();
  }
});
