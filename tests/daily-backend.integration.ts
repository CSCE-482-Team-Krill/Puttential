import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { centralDateString, shiftDate } from '../src/backend/puzzle-date';
import {
  decodePuzzle,
  decodePlayer,
  decodeRun,
  decodeBoard,
  decodeArchive,
} from '../src/shared/response-validation';
import type { Placement } from '../src/shared/puzzle-contracts';
import { openingCourse } from '../src/backend/daily-courses';

const connection = process.env.TEST_DATABASE_URL;
if (!connection)
  throw new Error(
    'Set TEST_DATABASE_URL to a migrated, provisioned disposable PostgreSQL database.',
  );
const target = new URL(connection);
if (
  !['127.0.0.1', 'localhost'].includes(target.hostname) ||
  !/test|iteration_two/.test(target.pathname)
)
  throw new Error('Integration tests require an explicitly named local test database.');
process.env.DATABASE_URL = connection;
let competitiveHandler: (typeof import('../src/backend/competitive-http'))['competitiveHandler'];
let prisma: (typeof import('../src/backend/prisma'))['prisma'];
const guests: string[] = [];
const puzzles: string[] = [];
before(async () => {
  ({ competitiveHandler } = await import('../src/backend/competitive-http'));
  ({ prisma } = await import('../src/backend/prisma'));
});
after(async () => {
  await prisma.competitiveRun.deleteMany({ where: { guestId: { in: guests } } });
  await prisma.guestProgress.deleteMany({ where: { guestId: { in: guests } } });
  await prisma.guest.deleteMany({ where: { id: { in: guests } } });
  await prisma.puzzle.deleteMany({ where: { id: { in: puzzles } } });
  await prisma.$disconnect();
});
const origin = 'http://127.0.0.1:3000';
async function call(path: string, method = 'GET', payload?: unknown, cookie?: string) {
  return competitiveHandler(
    new Request(`${origin}/api/${path}`, {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }),
  );
}
async function guest() {
  const response = await call('guest', 'POST', {});
  assert.equal(response.status, 200);
  const player = decodePlayer(await response.json()).player;
  guests.push(player.id);
  return { player, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}
test('real PostgreSQL daily flow: ownership, replay, idempotency, ties, optimization and archive', async () => {
  const a = await guest(),
    b = await guest();
  const unauthenticated = await call('me');
  assert.equal(unauthenticated.status, 401);
  assert.equal((await call('me', 'GET', undefined, a.cookie)).status, 200);
  const p = decodePuzzle(await (await call('puzzles/today')).json());
  const stored = await prisma.puzzle.findUniqueOrThrow({ where: { id: p.id } });
  const solutions = (stored.authorSolution as any).solutions as Placement[];
  const start = (g: typeof a, placement: Placement, requestId = randomUUID()) =>
    call(
      'runs',
      'POST',
      { expectedGuestId: g.player.id, puzzleId: p.id, requestId, placement },
      g.cookie,
    );
  const finish = (g: typeof a, id: string) =>
    call(
      `runs/${id}/complete`,
      'POST',
      { expectedGuestId: g.player.id, kind: 'terminal' },
      g.cookie,
    );
  const id = randomUUID();
  const starts = await Promise.all([start(a, solutions[0]!, id), start(a, solutions[0]!, id)]);
  assert.deepEqual(
    starts.map((r) => r.status),
    [200, 200],
  );
  const run = decodeRun(await starts[0]!.json()),
    duplicate = decodeRun(await starts[1]!.json());
  assert.equal(run.runId, duplicate.runId);
  assert.equal(run.attemptOrdinal, 1);
  assert.equal((await call(`runs/${run.runId}`, 'GET', undefined, b.cookie)).status, 404);
  assert.equal(
    (
      await call(
        'runs',
        'POST',
        {
          expectedGuestId: a.player.id,
          puzzleId: p.id,
          requestId: randomUUID(),
          placement: solutions[0],
        },
        b.cookie,
      )
    ).status,
    409,
  );
  assert.equal((await start(a, solutions[1]!, id)).status, 409);
  const completes = await Promise.all([
    finish(a, run.runId),
    finish(a, run.runId),
    finish(a, run.runId),
  ]);
  assert.ok(completes.every((r) => r.status === 200));
  const saved = decodeRun(
    await (await call(`runs/${run.runId}`, 'GET', undefined, a.cookie)).json(),
  );
  assert.equal(saved.state, 'saved');
  if (saved.state !== 'saved') throw new Error('Result not saved');
  assert.equal(saved.result.outcome, 'success');
  assert.equal(saved.result.verification, 'verified');
  assert.equal(saved.result.dailyEligible, true);
  assert.equal(saved.progress.attemptsStarted, 1);
  assert.equal(saved.progress.firstSolveAttempts, 1);
  const optimized = decodeRun(await (await start(a, solutions[1]!)).json());
  const better = decodeRun(await (await finish(a, optimized.runId)).json());
  assert.equal(better.state, 'saved');
  assert.equal(better.progress.firstSolveAttempts, 1);
  assert.equal(better.progress.bestDaily?.runId, optimized.runId);
  const tied = decodeRun(await (await start(b, solutions[1]!)).json());
  await finish(b, tied.runId);
  const board = decodeBoard(
    await (
      await call(
        `puzzles/${p.id}/leaderboard?scope=daily&view=top&limit=1`,
        'GET',
        undefined,
        a.cookie,
      )
    ).json(),
  );
  assert.equal(board.me?.rank, 1);
  assert.ok(board.totalPlayers >= 2);
  assert.ok(board.nextCursor);
  const fullBoard = decodeBoard(
    await (
      await call(
        `puzzles/${p.id}/leaderboard?scope=daily&view=top&limit=50`,
        'GET',
        undefined,
        a.cookie,
      )
    ).json(),
  );
  assert.equal(fullBoard.rows.find((r) => r.player.id === b.player.id)?.rank, fullBoard.me?.rank);
  assert.equal(
    fullBoard.me?.percentile,
    (100 * fullBoard.rows.filter((r) => r.rank > fullBoard.me!.rank).length) /
      fullBoard.totalPlayers,
  );
  const otherCursor = await call(
    `puzzles/${p.id}/leaderboard?scope=daily&view=top&limit=1&cursor=${board.nextCursor}`,
    'GET',
    undefined,
    b.cookie,
  );
  assert.equal(otherCursor.status, 409);
  const pageTwo = decodeBoard(
    await (
      await call(
        `puzzles/${p.id}/leaderboard?scope=daily&view=top&limit=1&cursor=${board.nextCursor}`,
        'GET',
        undefined,
        a.cookie,
      )
    ).json(),
  );
  assert.equal(pageTwo.rows[0]?.rank, 1);
  const tampered = board.nextCursor!.split('.');
  const tamperedBody = JSON.parse(Buffer.from(tampered[0]!, 'base64url').toString());
  tamperedBody.offset = 0;
  tampered[0] = Buffer.from(JSON.stringify(tamperedBody)).toString('base64url');
  assert.equal(
    (
      await call(
        `puzzles/${p.id}/leaderboard?scope=daily&view=top&cursor=${tampered.join('.')}`,
        'GET',
        undefined,
        a.cookie,
      )
    ).status,
    400,
  );
  const history = decodeArchive(
    await (await call('puzzles?limit=20', 'GET', undefined, a.cookie)).json(),
  );
  assert.ok(history.items.length >= 4);
  for (let days = -3; days < 0; days++)
    assert.equal(
      (await call(`puzzles/by-date/${shiftDate(centralDateString(), days)}`)).status,
      200,
    );
  assert.equal((await call(`puzzles/by-date/${shiftDate(centralDateString(), 1)}`)).status, 404);
  const bad = structuredClone(solutions[0]!);
  bad.commands[0] = { ...bad.commands[0]!, fieldId: 'fixed-obstacle' };
  assert.equal((await start(a, bad)).status, 400);
  // A forged client score is irrelevant: this placement leaves every force disabled.
  const noForce = structuredClone(solutions[0]!);
  for (const c of noForce.commands) if (c.type === 'set-field-enabled') c.enabled = false;
  const forged = decodeRun(await (await start(a, noForce)).json());
  const rejectedScore = decodeRun(
    await (
      await call(
        `runs/${forged.runId}/complete`,
        'POST',
        { expectedGuestId: a.player.id, kind: 'terminal', success: true, forceCost: 0 },
        a.cookie,
      )
    ).json(),
  );
  assert.equal(rejectedScore.state, 'saved');
  if (rejectedScore.state === 'saved') assert.notEqual(rejectedScore.result.outcome, 'success');
  assert.equal(rejectedScore.progress.bestDaily?.runId, optimized.runId);
  // A late archive receipt cannot enter yesterday's closed daily board.
  const date = shiftDate(centralDateString(), -1),
    old = decodePuzzle(await (await call(`puzzles/by-date/${date}`)).json());
  const oldStored = await prisma.puzzle.findUniqueOrThrow({ where: { id: old.id } }),
    oldPlacement = (oldStored.authorSolution as any).solutions[0];
  const archived = decodeRun(
    await (
      await call(
        'runs',
        'POST',
        {
          expectedGuestId: a.player.id,
          puzzleId: old.id,
          requestId: randomUUID(),
          placement: oldPlacement,
        },
        a.cookie,
      )
    ).json(),
  );
  const late = decodeRun(await (await finish(a, archived.runId)).json());
  assert.equal(late.state, 'saved');
  if (late.state === 'saved') assert.equal(late.result.dailyEligible, false);
  const closed = decodeBoard(
    await (
      await call(`puzzles/${old.id}/leaderboard?scope=daily&view=top`, 'GET', undefined, a.cookie)
    ).json(),
  );
  assert.equal(closed.final, true);
  assert.equal(closed.totalPlayers, 0);
  const archiveBoard = decodeBoard(
    await (
      await call(`puzzles/${old.id}/leaderboard?scope=archive&view=top`, 'GET', undefined, a.cookie)
    ).json(),
  );
  assert.ok(archiveBoard.totalPlayers >= 1);
  assert.equal(archiveBoard.me?.player.id, a.player.id);
  const crossOrigin = await competitiveHandler(
    new Request(`${origin}/api/guest`, {
      method: 'POST',
      headers: { Origin: 'https://unrelated.example' },
    }),
  );
  assert.equal(crossOrigin.status, 403);
});

test('a committed pre-cutoff receipt survives worker loss and blocks finality until replay completes', async () => {
  const g = await guest(),
    c = openingCourse(0),
    date = shiftDate(centralDateString(), -30);
  const p = await prisma.puzzle.create({
    data: {
      date: new Date(`${date}T00:00:00Z`),
      seed: 'acceptance-recovery',
      title: 'Recovery acceptance',
      difficulty: 1,
      configuration: c.level as any,
      rules: c.rules as any,
    },
  });
  puzzles.push(p.id);
  const accepted = decodeRun(
    await (
      await call(
        'runs',
        'POST',
        {
          expectedGuestId: g.player.id,
          requestId: randomUUID(),
          puzzleId: p.id,
          placement: c.solutions[0],
        },
        g.cookie,
      )
    ).json(),
  );
  // Emulate a crashed host after the original transaction committed its immutable receipt.
  const intent = { expectedGuestId: g.player.id, kind: 'terminal' };
  await prisma.competitiveRun.update({
    where: { id: accepted.runId },
    data: {
      state: 'processing',
      startedAt: new Date(`${date}T18:00:00Z`),
      dailyEligible: true,
      completion: { intent, receivedAt: `${date}T19:00:00Z`, dailyEligible: true },
      leaseToken: 'crashed-worker',
      leaseUntil: new Date(Date.now() + 60000),
      revision: { increment: 1 },
    },
  });
  const before = decodeBoard(
    await (
      await call(`puzzles/${p.id}/leaderboard?scope=daily&view=top`, 'GET', undefined, g.cookie)
    ).json(),
  );
  assert.equal(before.submissionClosed, true);
  assert.equal(before.pendingEligibleCount, 1);
  assert.equal(before.final, false);
  await prisma.competitiveRun.update({
    where: { id: accepted.runId },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  const recovered = decodeRun(
    await (await call(`runs/${accepted.runId}`, 'GET', undefined, g.cookie)).json(),
  );
  assert.equal(recovered.state, 'saved');
  if (recovered.state === 'saved') assert.equal(recovered.result.dailyEligible, true);
  const after = decodeBoard(
    await (
      await call(`puzzles/${p.id}/leaderboard?scope=daily&view=top`, 'GET', undefined, g.cookie)
    ).json(),
  );
  assert.equal(after.pendingEligibleCount, 0);
  assert.equal(after.final, true);
  assert.equal(after.totalPlayers, 1);
  const unfinished = decodeRun(
    await (
      await call(
        'runs',
        'POST',
        {
          expectedGuestId: g.player.id,
          requestId: randomUUID(),
          puzzleId: p.id,
          placement: c.solutions[0],
        },
        g.cookie,
      )
    ).json(),
  );
  const { cancelPuzzle } = await import('../src/backend/competitive');
  await cancelPuzzle(date, 'Acceptance cancellation');
  assert.equal(
    (await prisma.competitiveRun.findUniqueOrThrow({ where: { id: unfinished.runId } })).state,
    'canceled',
  );
  const historical = decodeRun(
    await (await call(`runs/${accepted.runId}`, 'GET', undefined, g.cookie)).json(),
  );
  assert.equal(historical.state, 'saved');
  assert.equal(historical.availability.publicationStatus, 'canceled');
  const canceled = decodeBoard(
    await (
      await call(`puzzles/${p.id}/leaderboard?scope=daily&view=top`, 'GET', undefined, g.cookie)
    ).json(),
  );
  assert.equal(canceled.totalPlayers, 0);
  assert.equal(canceled.final, false);
});
