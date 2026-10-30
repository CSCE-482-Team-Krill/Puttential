import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayAccess } from '../src/backend/replay-access';
import { openingCourse } from '../src/backend/daily-courses';
import { replayRun } from '../src/game/run-evaluation';
import { ReplayPlayback } from '../src/frontend/replay-playback';
import { decodeReplay, decodeBoard } from '../src/shared/response-validation';
import type { ReplayResponse, SavedResult } from '../src/shared/puzzle-contracts';
import { boardFixture, puzzleFixture } from './iteration-two-fixtures';

test('replays unlock at the exact Central midnight, including short and long DST days', () => {
  for (const [date, midnight] of [
    ['2026-10-30', '2026-10-31T05:00:00.000Z'],
    ['2026-03-08', '2026-03-09T05:00:00.000Z'],
    ['2026-11-01', '2026-11-02T06:00:00.000Z'],
  ]) {
    const cutoff = new Date(midnight!);
    assert.deepEqual(replayAccess(date!, new Date(+cutoff - 1)), {
      available: false,
      unlocksAt: midnight,
    });
    assert.deepEqual(replayAccess(date!, cutoff), { available: true, unlocksAt: midnight });
    assert.equal(replayAccess(date!, cutoff, true).available, false);
  }
});

async function verifiedResult() {
  const course = openingCourse(0);
  const evaluation = await replayRun(course.level, course.solutions[0]!, course.rules);
  assert.equal(evaluation.outcome, 'success');
  const result: SavedResult = {
    runId: 'verified-replay',
    ...evaluation,
    verification: 'verified',
    dailyEligible: true,
    savedAt: '2026-10-30T18:00:00Z',
  };
  return { course, result };
}

test('spectator playback matches verification at each speed, pauses and restarts without mutating placements', async () => {
  const { course, result } = await verifiedResult();
  const placement = structuredClone(course.solutions[0]!);
  const before = structuredClone(placement);
  for (const speed of [0.5, 1, 2] as const) {
    const replay = await ReplayPlayback.create(course.level, course.rules, placement, result);
    try {
      assert.equal(replay.status, 'paused');
      assert.equal(replay.frame.tick, 0);
      replay.advance(1);
      assert.equal(replay.frame.tick, 0);
      replay.speed = speed;
      replay.play();
      replay.advance(1 / 60);
      assert.equal(replay.frame.tick, speed * 2);
      replay.pause();
      const paused = replay.frame.tick;
      replay.advance(1);
      assert.equal(replay.frame.tick, paused);
      replay.play();
      for (
        let frames = 0;
        frames < course.rules.maxTicks * 2 && replay.status === 'playing';
        frames++
      )
        replay.advance(1 / 60);
      assert.equal(replay.status, 'ended', replay.error ?? undefined);
      assert.equal(replay.frame.tick, result.metrics!.completionTick);
      replay.advance(1);
      assert.equal(replay.frame.tick, result.metrics!.completionTick);
      replay.restart();
      assert.equal(replay.status, 'paused');
      assert.equal(replay.frame.tick, 0);
      assert.equal(replay.goal.completedTick, null);
      assert.equal(replay.speed, speed);
      replay.play();
      // A large elapsed time is bounded; it never jumps over physics evaluation ticks.
      replay.advance(30);
      assert.equal(replay.frame.tick, Math.min(16, speed * 30));
    } finally {
      replay.destroy();
      replay.destroy();
    }
    const tick = replay.frame.tick;
    replay.play();
    replay.advance(1);
    replay.restart();
    assert.equal(replay.frame.tick, tick);
  }
  assert.deepEqual(placement, before);
});

test('spectator playback rejects unsupported setup and detects a changed saved result', async () => {
  const { course, result } = await verifiedResult();
  await assert.rejects(
    ReplayPlayback.create(
      course.level,
      course.rules,
      { ...course.solutions[0]!, simulationVersion: 'obsolete' },
      result,
    ),
    /Unsupported course versions/,
  );
  const replay = await ReplayPlayback.create(course.level, course.rules, course.solutions[0]!, {
    ...result,
    metrics: { ...result.metrics!, completionTick: result.metrics!.completionTick + 1 },
  });
  try {
    replay.play();
    for (let frames = 0; frames < course.rules.maxTicks && replay.status === 'playing'; frames++)
      replay.advance(0.1);
    assert.equal(replay.status, 'error');
    assert.match(replay.error!, /does not match/);
  } finally {
    replay.destroy();
  }
});

test('replay transport rejects malformed commands and unverified or incorrectly scoped results', async () => {
  const { course, result } = await verifiedResult();
  const p = puzzleFixture();
  const response: ReplayResponse = {
    viewerGuestId: 'viewer',
    puzzleId: p.id,
    scope: 'daily',
    player: { id: 'other-player', nickname: 'Other player' },
    availability: p.availability,
    placement: course.solutions[0]!,
    result,
  };
  assert.deepEqual(decodeReplay(response), response);
  for (const mutate of [
    (r: any) => {
      r.result.verification = 'not-applicable';
    },
    (r: any) => {
      r.result.outcome = 'stopped';
    },
    (r: any) => {
      r.result.dailyEligible = false;
    },
    (r: any) => {
      r.placement.commands[0].sequence = 5;
    },
    (r: any) => {
      r.placement.commands[0].xQ = 0.5;
    },
    (r: any) => {
      r.availability.publicationStatus = 'canceled';
    },
  ]) {
    const invalid = structuredClone(response);
    mutate(invalid);
    assert.throws(() => decodeReplay(invalid));
  }
  assert.doesNotThrow(() =>
    decodeReplay({ ...response, scope: 'archive', result: { ...result, dailyEligible: false } }),
  );
  const board = boardFixture();
  assert.throws(() =>
    decodeBoard({ ...board, replayAccess: { ...board.replayAccess, available: true } }),
  );
});
