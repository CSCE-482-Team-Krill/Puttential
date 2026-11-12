import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { communityPublishingFixture } from './community-publishing-fixtures';
import { decodeBoard, decodeReplay, decodeRun } from '../src/shared/response-validation';
import { decodeCommunityMap } from '../src/shared/community-response-validation';

const connection = process.env.TEST_DATABASE_URL;
if (!connection) throw new Error('Set TEST_DATABASE_URL to a local test database.');
const target = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/test/.test(target.pathname))
  throw new Error('Community integration tests require a local test database.');
process.env.DATABASE_URL = connection;
let handler: (typeof import('../src/backend/community-http'))['communityHandler'];
let guestHandler: (typeof import('../src/backend/competitive-http'))['competitiveHandler'];
let prisma: (typeof import('../src/backend/prisma'))['prisma'];
const guests: string[] = [];
const origin = 'http://127.0.0.1:3000';
before(async () => {
  ({ communityHandler: handler } = await import('../src/backend/community-http'));
  ({ competitiveHandler: guestHandler } = await import('../src/backend/competitive-http'));
  ({ prisma } = await import('../src/backend/prisma'));
});
after(async () => {
  await prisma.apiRateLimit.deleteMany({
    where: { key: { in: guests.map((id) => `community-publish:${id}`) } },
  });
  await prisma.competitiveRun.deleteMany({
    where: { puzzle: { communityMap: { authorId: { in: guests } } } },
  });
  await prisma.guestProgress.deleteMany({
    where: { puzzle: { communityMap: { authorId: { in: guests } } } },
  });
  await prisma.puzzle.deleteMany({ where: { communityMap: { authorId: { in: guests } } } });
  await prisma.communityMap.deleteMany({ where: { authorId: { in: guests } } });
  await prisma.guest.deleteMany({ where: { id: { in: guests } } });
  await prisma.$disconnect();
});
async function guest() {
  const response = await guestHandler(
    new Request(`${origin}/api/guest`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{}',
    }),
  );
  assert.equal(response.status, 200);
  const { player } = await response.json();
  guests.push(player.id);
  return { player, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}
function call(path = '', input?: unknown, cookie?: string) {
  return handler(
    new Request(`${origin}/api/community${path}`, {
      method: input === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    }),
  );
}

test('publishing verifies a real replay, persists an immutable map, and retries without duplicates', async () => {
  const { player, cookie } = await guest();
  const input = {
    ...communityPublishingFixture(),
    requestId: randomUUID(),
    expectedGuestId: player.id,
    title: 'Verified community course',
    description: 'A custom map',
  };
  assert.equal((await call('', input)).status, 401);
  assert.equal((await call('', { ...input, expectedGuestId: randomUUID() }, cookie)).status, 409);
  const response = await call('', input, cookie);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const { map } = await response.json();
  const duplicate = await call('', input, cookie);
  assert.equal(duplicate.status, 201);
  assert.equal((await duplicate.json()).map.id, map.id);
  const concurrent = { ...input, requestId: randomUUID() };
  const parallel = await Promise.all([call('', concurrent, cookie), call('', concurrent, cookie)]);
  assert.equal(parallel[0]!.status, 201);
  assert.equal(parallel[1]!.status, 201);
  assert.equal((await parallel[0]!.json()).map.id, (await parallel[1]!.json()).map.id);
  assert.equal((await call('', { ...input, title: 'Changed title' }, cookie)).status, 409);
  const published = await (await call(`/${map.id}`)).json();
  assert.equal(published.map.title, input.title);
  assert.equal(published.map.creatorName, player.nickname);
  assert.equal(published.map.configuration.id, input.document.level.id);
  assert.ok(published.map.rules.maxTicks > 0);
  assert.equal(published.map.authorSolution, undefined);
  assert.equal(published.map.submissionHash, undefined);
  assert.equal(published.map.authorId, undefined);
  assert.ok((await (await call()).json()).items.some((v: { id: string }) => v.id === map.id));
  const stored = await prisma.communityMap.findUniqueOrThrow({ where: { id: map.id } });
  assert.deepEqual(stored.authorSolution, input.placement);
  assert.equal(
    await prisma.communityMap.count({ where: { authorId: player.id, requestId: input.requestId } }),
    1,
  );
  assert.equal((await call('/00000000-0000-0000-0000-000000000000')).status, 404);
});

test('community standings use verified runs, attempts, ties, pagination, best results and replays', async () => {
  const a = await guest(),
    b = await guest(),
    c = await guest();
  const fixture = communityPublishingFixture();
  const publication = await call(
    '',
    {
      ...fixture,
      requestId: randomUUID(),
      expectedGuestId: a.player.id,
      title: 'Ranked community course',
      description: '',
    },
    a.cookie,
  );
  assert.equal(publication.status, 201);
  const { map } = await publication.json();
  const detail = decodeCommunityMap(await (await call(`/${map.id}`)).json(), map.id);
  assert.equal(detail.competition.date, null);
  assert.equal(detail.competition.communityMapId, map.id);
  const id = detail.competition.id;
  const ranked = (g: typeof a, path: string, input?: unknown) =>
    guestHandler(
      new Request(`${origin}/api/${path}`, {
        method: input === undefined ? 'GET' : 'POST',
        headers: { Origin: origin, Cookie: g.cookie, 'Content-Type': 'application/json' },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      }),
    );
  const start = async (g: typeof a, requestId = randomUUID(), placement = fixture.placement) => {
    const response = await ranked(g, 'runs', {
      expectedGuestId: g.player.id,
      requestId,
      puzzleId: id,
      placement,
    });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    return decodeRun(await response.json());
  };
  const finish = async (g: typeof a, runId: string, kind: 'terminal' | 'aborted' = 'terminal') => {
    const intent = {
      expectedGuestId: g.player.id,
      kind,
      ...(kind === 'aborted' ? { observedTick: 0 } : {}),
    };
    const response = await ranked(g, `runs/${runId}/complete`, intent);
    assert.equal(response.status, 200);
    return decodeRun(await response.json());
  };
  const board = async (g: typeof a, query = '') => {
    const response = await ranked(g, `puzzles/${id}/leaderboard?${query}`);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    return decodeBoard(await response.json());
  };
  assert.equal((await board(a)).totalPlayers, 0);
  const requestId = randomUUID();
  const aborted = await start(a, requestId);
  assert.equal((await start(a, requestId)).runId, aborted.runId);
  await finish(a, aborted.runId, 'aborted');
  assert.equal((await board(a)).totalPlayers, 0);
  // A community solve remains rankable days after publication, without a daily cutoff.
  const old = new Date('2026-10-01T12:00:00.000Z');
  await prisma.puzzle.update({ where: { id }, data: { createdAt: old } });
  for (const g of [a, b, c]) {
    const accepted = await start(g);
    await prisma.competitiveRun.update({ where: { id: accepted.runId }, data: { startedAt: old } });
    const result = await finish(g, accepted.runId);
    assert.equal(result.state, 'saved');
    if (result.state !== 'saved') throw new Error('Expected a verified result');
    assert.equal(result.result.verification, 'verified');
    assert.equal(result.result.outcome, 'success');
    assert.equal(result.result.dailyEligible, false);
    assert.equal(result.progress.bestDaily, null);
    assert.equal(result.progress.bestArchive?.runId, result.runId);
    assert.equal((await finish(g, accepted.runId)).runId, result.runId);
  }
  const standings = await board(a);
  assert.equal(standings.scope, 'archive');
  assert.equal(standings.totalPlayers, 3);
  assert.deepEqual(
    standings.rows.map((row) => row.rank),
    [1, 1, 3],
  );
  assert.equal(standings.me?.rank, 3);
  assert.equal(standings.me?.firstSolveAttempts, 2);
  assert.equal(standings.submissionClosed, false);
  assert.equal(standings.final, false);
  assert.equal(standings.replayAccess.available, true);
  assert.ok(Math.abs(Date.parse(standings.asOf) - Date.now()) < 5000);
  assert.equal((await board(a, 'view=around-me&limit=1')).rows[0]?.player.id, a.player.id);
  const first = await board(a, 'limit=1');
  assert.ok(first.nextCursor);
  const next = await board(a, `limit=1&cursor=${encodeURIComponent(first.nextCursor)}`);
  assert.notEqual(first.rows[0]?.player.id, next.rows[0]?.player.id);
  assert.equal(
    (await ranked(b, `puzzles/${id}/leaderboard?cursor=${encodeURIComponent(first.nextCursor)}`))
      .status,
    409,
  );
  assert.equal((await ranked(a, `puzzles/${id}/leaderboard?scope=daily`)).status, 400);
  const replayResponse = await ranked(a, `puzzles/${id}/replays/${b.player.id}?scope=archive`);
  assert.equal(replayResponse.status, 200);
  const replay = decodeReplay(await replayResponse.json());
  assert.deepEqual(replay.placement, fixture.placement);
  assert.equal(replay.result.runId, (await board(b)).me?.bestRunId);
  const best = standings.me!.bestRunId;
  // Repeating an equal solution counts a start without replacing the saved best.
  await finish(a, (await start(a)).runId);
  assert.equal((await board(a)).me?.bestRunId, best);
  assert.equal(
    (await ranked(a, `puzzles/${id}/leaderboard?cursor=${encodeURIComponent(first.nextCursor)}`))
      .status,
    409,
  );
  const progress = await (await ranked(a, `me/progress?puzzleId=${id}`)).json();
  assert.equal(progress.progress.attemptsStarted, 3);
  assert.equal(progress.progress.firstSolveAttempts, 2);
  const archive = await (await ranked(a, 'puzzles')).json();
  assert.ok(!archive.items.some((course: { id: string }) => course.id === id));
  const otherMap = await (
    await call(
      '',
      {
        ...fixture,
        requestId: randomUUID(),
        expectedGuestId: a.player.id,
        title: 'Separate community course',
        description: '',
      },
      a.cookie,
    )
  ).json();
  const otherBoard = await (await ranked(a, `puzzles/${otherMap.map.id}/leaderboard`)).json();
  assert.equal(otherBoard.totalPlayers, 0);
});

test('unsolved, changed, malformed and oversized map submissions never publish', async () => {
  const { player, cookie } = await guest();
  const input = {
    ...communityPublishingFixture(),
    requestId: randomUUID(),
    expectedGuestId: player.id,
    title: 'Rejected community course',
    description: '',
  };
  const unsolved = structuredClone(input);
  unsolved.document.level.goal = {
    ...unsolved.document.level.goal,
    minX: 3.45,
    maxX: 6.35,
    minY: -3.4,
    maxY: -1.3,
  };
  const failed = await call('', unsolved, cookie);
  assert.equal(failed.status, 422, JSON.stringify(await failed.clone().json()));
  assert.equal((await failed.json()).code, 'PROOF_FAILED');
  const outside = structuredClone(input);
  outside.document.level.dynamicBodies[0]!.position = { x: 1001, y: 1001 };
  assert.equal((await call('', outside, cookie)).status, 400);
  assert.equal((await call('', { ...input, placement: null }, cookie)).status, 400);
  assert.equal(
    (await call('', { ...input, description: 'x'.repeat(270_000) }, cookie)).status,
    413,
  );
  assert.equal(await prisma.communityMap.count({ where: { authorId: player.id } }), 0);
  const foreign = await handler(
    new Request(`${origin}/api/community`, {
      method: 'POST',
      headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  assert.equal(foreign.status, 403);
});

test('community browsing paginates stable public summaries without requiring a guest', async () => {
  const { player } = await guest();
  await prisma.communityMap.createMany({
    data: Array.from({ length: 23 }, (_, index) => ({
      id: randomUUID(),
      authorId: player.id,
      requestId: randomUUID(),
      submissionHash: 'fixture',
      title: `Page ${index}`,
      description: '',
      creatorName: player.nickname,
      configuration: {},
      rules: {},
      authorSolution: {},
      createdAt: new Date(Date.now() + index * 1000),
    })),
  });
  const first = await (await call()).json();
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const second = await (await call(`?cursor=${first.nextCursor}`)).json();
  assert.ok(second.items.length >= 3);
  const ids = new Set(first.items.map((v: { id: string }) => v.id));
  assert.ok(second.items.every((v: { id: string }) => !ids.has(v.id)));
  assert.equal(first.items[0].configuration, undefined);
  assert.equal((await call('?cursor=invalid')).status, 400);
});

test('concurrent publications cannot exceed the last hourly publishing slot', async () => {
  const { player, cookie } = await guest();
  const input = {
    ...communityPublishingFixture(),
    requestId: randomUUID(),
    expectedGuestId: player.id,
    title: 'Last hourly slot',
    description: '',
  };
  for (let index = 0; index < 9; index++)
    assert.equal((await call('', { ...input, requestId: randomUUID() }, cookie)).status, 201);
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => call('', { ...input, requestId: randomUUID() }, cookie)),
  );
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 429, 429]);
  assert.equal(await prisma.communityMap.count({ where: { authorId: player.id } }), 10);
});

test('failed solutions consume verification admission, while acknowledged retries remain available', async () => {
  const { player, cookie } = await guest();
  const input = {
    ...communityPublishingFixture(),
    requestId: randomUUID(),
    expectedGuestId: player.id,
    title: 'Bounded verification',
    description: '',
  };
  const published = await call('', input, cookie);
  assert.equal(published.status, 201);
  await prisma.apiRateLimit.upsert({
    where: { key: `community-publish:${player.id}` },
    update: { count: 29 },
    create: {
      key: `community-publish:${player.id}`,
      count: 29,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const unsolved = structuredClone(input);
  unsolved.requestId = randomUUID();
  unsolved.document.level.goal = {
    ...unsolved.document.level.goal,
    minX: 3.45,
    maxX: 6.35,
    minY: -3.4,
    maxY: -1.3,
  };
  assert.equal((await call('', unsolved, cookie)).status, 422);
  assert.equal((await call('', { ...input, requestId: randomUUID() }, cookie)).status, 429);
  assert.equal((await call('', input, cookie)).status, 201);
  await prisma.apiRateLimit.update({
    where: { key: `community-publish:${player.id}` },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await call('', { ...input, requestId: randomUUID() }, cookie)).status, 201);
});

test('the publishing route uses strict transport and rejects decorated solution commands', async () => {
  const { player, cookie } = await guest();
  const input = {
    ...communityPublishingFixture(),
    requestId: randomUUID(),
    expectedGuestId: player.id,
    title: 'Strict publication',
    description: '',
  };
  for (const headers of [
    { 'Content-Type': 'application/jsonp' },
    { 'Content-Type': 'application/json; charset=utf-16' },
    { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  ]) {
    const response = await handler(
      new Request(`${origin}/api/community`, {
        method: 'POST',
        headers: { ...headers, Origin: origin, Cookie: cookie },
        body: JSON.stringify(input),
      }),
    );
    assert.equal(response.status, 415);
  }
  assert.equal(
    (await call('', { ...input, placement: { ...input.placement, extra: true } }, cookie)).status,
    400,
  );
  const decorated = structuredClone(input);
  Object.assign(decorated.placement.commands[0]!, { ignored: 'untrusted' });
  assert.equal((await call('', decorated, cookie)).status, 400);
  assert.equal(await prisma.communityMap.count({ where: { authorId: player.id } }), 0);
});
