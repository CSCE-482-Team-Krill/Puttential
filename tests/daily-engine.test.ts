import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openingCourse } from '../src/backend/daily-courses';
import { replayRun, validatePlacement, canonicalField } from '../src/game/run-evaluation';
import { createGame, starterLevels } from '../src/game';
import { deliveredEngine } from '../src/frontend/engine-adapter';
import { centralMidnight, shiftDate } from '../src/backend/puzzle-date';

test('reviewed daily courses have two distinct successful layouts and repeatable shared replay', async () => {
  for (let i = 0; i < 4; i++) {
    const c = openingCourse(i);
    assert.notDeepEqual(c.solutions[0], c.solutions[1]);
    for (const p of c.solutions) {
      const replay = await replayRun(c.level, p!, c.rules);
      assert.equal(replay.outcome, 'success');
      assert.deepEqual(await replayRun(c.level, p!, c.rules), replay);
      const game = await createGame(c.level);
      try {
        deliveredEngine.applySetup(game, p!);
        assert.equal(game.getRenderState().tick, 0);
        deliveredEngine.begin(game, c.level, c.rules);
        let result;
        for (let tick = 0; tick < c.rules.maxTicks; tick++) {
          game.step();
          result = deliveredEngine.step(game, game.getRenderState());
          if (result) break;
        }
        assert.deepEqual(result, replay);
      } finally {
        game.destroy();
      }
    }
  }
});
test('canonical setup enforces full inventory, version, angle and geometry before playback', async () => {
  const c = openingCourse(0),
    p = c.solutions[0]!;
  for (const mutate of [
    (v: typeof p) => {
      v.commands.pop();
    },
    (v: typeof p) => {
      v.commands[0]!.fieldId = 'unknown';
    },
    (v: typeof p) => {
      v.simulationVersion = 'unknown';
    },
    (v: typeof p) => {
      const a = v.commands.find((c) => c.type === 'set-field-angle')!;
      if (a.type === 'set-field-angle') a.angleQ = 3600;
    },
    (v: typeof p) => {
      const a = v.commands.find((c) => c.type === 'move-field')!;
      if (a.type === 'move-field') a.xQ = 100 * 1024;
    },
  ]) {
    const bad = structuredClone(p);
    mutate(bad);
    assert.throws(() => validatePlacement(c.level, bad, c.rules));
  }
  assert.throws(
    () =>
      canonicalField(
        c.level,
        'gentle-push',
        { position: { x: 6, y: 6 }, angle: Math.PI / 4, enabled: false },
        c.rules,
      ),
    /inside/,
  );
  const game = await createGame(c.level);
  try {
    game.applySetup(p.commands);
    game.step();
    assert.throws(() => game.applySetup(p.commands), /tick-zero/);
    assert.throws(
      () =>
        game.queueCommand({
          type: 'set-field-angle',
          fieldId: 'gentle-push',
          angleQ: -1,
          sequence: 0,
        }),
      /angleQ/,
    );
  } finally {
    game.destroy();
  }
});
test('daily boundaries retain Central DST calendar days', () => {
  for (const [date, hours] of [
    ['2026-03-08', 23],
    ['2026-11-01', 25],
    ['2026-10-26', 24],
  ] as const)
    assert.equal(
      (centralMidnight(shiftDate(date, 1)).getTime() - centralMidnight(date).getTime()) / 3600_000,
      hours,
    );
});

test('planning prediction follows the goal body on multi-body courses', async () => {
  const c = openingCourse(0);
  const level = {
    ...c.level,
    dynamicBodies: [
      {
        ...c.level.dynamicBodies[0]!,
        id: 'aaa-decoration',
        position: { x: -5, y: -5 },
        pieces: [{ ...c.level.dynamicBodies[0]!.pieces[0]!, id: 'decoration-piece' }],
      },
      ...c.level.dynamicBodies,
    ],
  };
  const game = await createGame(level);
  try {
    const preview = deliveredEngine.preview(game, c.solutions[0]!, 60, level.goal.bodyId);
    const expected = game
      .predict(c.solutions[0]!.commands, { maxTicks: 60, sampleEveryTicks: 1 })
      .samples.flatMap((sample) =>
        sample.bodies.filter((b) => b.id === level.goal.bodyId).map((b) => b.position),
      );
    assert.deepEqual(preview, expected);
    assert.ok(preview.length > 0);
  } finally {
    game.destroy();
  }
});
