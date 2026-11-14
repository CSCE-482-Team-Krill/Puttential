import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { CommunityMapList } from '../src/shared/community-maps';

const connection = process.env.TEST_DATABASE_URL;
if (!connection) throw new Error('Set TEST_DATABASE_URL to a local test database.');
const target = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/test/.test(target.pathname))
  throw new Error('Community integration tests require a local test database.');
process.env.DATABASE_URL = connection;
let handler: (typeof import('../src/backend/community-http'))['communityHandler'];
let prisma: (typeof import('../src/backend/prisma'))['prisma'];
const authorId = randomUUID();
const marker = randomUUID();
const now = Date.now();
const recent = new Date(now - 86400_000);
const matching = Array.from({ length: 23 }, (_, index) => ({
  id: randomUUID(),
  title: `Valley ${String(Math.floor(index / 2)).padStart(2, '0')}`,
  description: marker,
  creatorName: 'Search Maker',
  createdAt: recent,
}));
const extras = [
  { title: 'Valley month', creatorName: 'Search Maker', createdAt: new Date(now - 14 * 86400_000) },
  { title: 'Valley old', creatorName: 'Search Maker', createdAt: new Date(now - 60 * 86400_000) },
  { title: 'Valley other', creatorName: 'Other Maker', createdAt: recent },
  { title: 'Cliff course', creatorName: 'Search Maker', createdAt: recent },
  { title: '100% power', creatorName: 'Special Maker', createdAt: recent },
  { title: 'under_score', creatorName: 'Special Maker', createdAt: recent },
  { title: 'back\\slash', creatorName: 'Special Maker', createdAt: recent },
].map((map) => ({ ...map, id: randomUUID(), description: marker }));

before(async () => {
  ({ communityHandler: handler } = await import('../src/backend/community-http'));
  ({ prisma } = await import('../src/backend/prisma'));
  await prisma.guest.create({
    data: {
      id: authorId,
      nickname: 'Search Maker',
      sessionHash: randomUUID(),
      expiresAt: new Date(now + 86400_000),
    },
  });
  await prisma.communityMap.createMany({
    data: [...matching, ...extras].map((map) => ({
      ...map,
      authorId,
      requestId: randomUUID(),
      submissionHash: 'search-fixture',
      configuration: {},
      rules: {},
      authorSolution: {},
    })),
  });
});

after(async () => {
  await prisma.communityMap.deleteMany({ where: { authorId } });
  await prisma.guest.deleteMany({ where: { id: authorId } });
  await prisma.$disconnect();
});

function call(params: URLSearchParams) {
  return handler(new Request(`http://127.0.0.1:3000/api/community?${params}`));
}
async function list(filters: Record<string, string>) {
  const response = await call(new URLSearchParams(filters));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return (await response.json()) as CommunityMapList;
}

test('combined case-insensitive search, creator and date filters paginate every sort without duplicates', async () => {
  for (const sort of ['newest', 'oldest', 'title']) {
    const filters = { q: '  VALLEY  ', creator: '  SEARCH MAKER  ', published: 'week', sort };
    const first = await list(filters);
    assert.equal(first.items.length, 20);
    assert.ok(first.nextCursor);
    const second = await list({ ...filters, cursor: first.nextCursor });
    assert.equal(second.items.length, 3);
    assert.equal(second.nextCursor, null);
    const actual = [...first.items, ...second.items];
    const expected = [...matching].sort((a, b) => {
      const compare = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
      if (sort === 'title') return compare(a.title, b.title) || compare(a.id, b.id);
      return compare(a.id, b.id) * (sort === 'newest' ? -1 : 1);
    });
    assert.deepEqual(
      actual.map((map) => map.id),
      expected.map((map) => map.id),
    );
    assert.equal(new Set(actual.map((map) => map.id)).size, 23);
    assert.equal('configuration' in actual[0]!, false);
  }
});

test('publication windows and ascending/descending dates include only the requested maps', async () => {
  const filters = { q: 'valley', creator: 'search maker' };
  const month = await list({ ...filters, published: 'month', sort: 'oldest' });
  assert.equal(month.items[0]!.title, 'Valley month');
  const all = await list({ ...filters, sort: 'oldest' });
  assert.equal(all.items[0]!.title, 'Valley old');
  assert.equal(all.items[1]!.title, 'Valley month');
  const newest = await list(filters);
  assert.equal(newest.items[0]!.createdAt, recent.toISOString());
});

test('search spans descriptions and creators and treats LIKE wildcards and backslashes literally', async () => {
  let page = await list({ q: marker, creator: 'Other Maker' });
  assert.deepEqual(
    page.items.map((map) => map.title),
    ['Valley other'],
  );
  page = await list({ q: 'special maker' });
  assert.equal(page.items.length, 3);
  for (const [q, title] of [
    ['%', '100% power'],
    ['_', 'under_score'],
    ['\\', 'back\\slash'],
  ]) {
    page = await list({ q: q! });
    assert.deepEqual(
      page.items.map((map) => map.title),
      [title],
    );
  }
  page = await list({ q: 'unmatched search' });
  assert.deepEqual(page, { items: [], nextCursor: null });
});

test('invalid filters and cursors return useful client errors', async () => {
  for (const filters of [
    { q: 'x'.repeat(101) },
    { creator: 'x'.repeat(41) },
    { published: 'year' },
    { sort: 'unknown' },
    { cursor: 'invalid' },
  ]) {
    const response = await call(new URLSearchParams(filters));
    assert.equal(response.status, 400);
    assert.equal(
      (await response.json()).code,
      'cursor' in filters ? 'INVALID_CURSOR' : 'INVALID_FILTER',
    );
  }
  assert.deepEqual(await list({ cursor: randomUUID() }), { items: [], nextCursor: null });
});
