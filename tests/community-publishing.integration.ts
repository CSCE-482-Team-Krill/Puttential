import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { communityPublishingFixture } from './community-publishing-fixtures';

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
  outside.document.level.dynamicBodies[0]!.position = { x: 999, y: 999 };
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
