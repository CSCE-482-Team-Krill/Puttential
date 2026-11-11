import test from 'node:test';
import assert from 'node:assert/strict';
import { communityApi, CommunityApiError } from '../src/frontend/community-api';
import { communityPublishingFixture } from './community-publishing-fixtures';
import { defaultRules } from '../src/game/run-evaluation';

const summary = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'A community map',
  description: '',
  creatorName: 'Test author',
  createdAt: '2026-11-10T00:00:00.000Z',
};
const detail = () => {
  const { document } = communityPublishingFixture();
  return { ...summary, configuration: document.level, rules: defaultRules(document.level) };
};
const invalidData = (error: unknown) =>
  error instanceof CommunityApiError && error.code === 'INVALID_DATA' && error.retryable;

test('community reads honor both their deadline and caller cancellation', async (t) => {
  let deadline = new AbortController();
  const signals: AbortSignal[] = [];
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  t.mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
    const signal = options.signal!;
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Canceled')), { once: true });
    });
  });
  const caller = new AbortController();
  const timedOut = communityApi.list(undefined, caller.signal);
  deadline.abort();
  await assert.rejects(timedOut, /Canceled/);
  assert.equal(caller.signal.aborted, false);
  deadline = new AbortController();
  const canceled = communityApi.list(undefined, caller.signal);
  caller.abort();
  await assert.rejects(canceled, /Canceled/);
  assert.equal(deadline.signal.aborted, false);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('community endpoints decode valid public responses and keep unsupported versions readable', async (t) => {
  let response: unknown = { items: [summary], nextCursor: null };
  t.mock.method(globalThis, 'fetch', async () => Response.json(response));
  assert.deepEqual(await communityApi.list(), response);
  response = { map: { ...detail(), authorSolution: 'private field is not part of the DTO' } };
  assert.deepEqual(await communityApi.read(summary.id), detail());
  const future = detail();
  future.rules.simulationVersion = 'future-engine';
  future.rules.rulesVersion = 'future-rules';
  response = { map: future };
  assert.deepEqual(await communityApi.read(summary.id), future);
  response = { map: summary };
  const { document, placement } = communityPublishingFixture();
  assert.deepEqual(
    await communityApi.publish({
      document,
      placement,
      title: summary.title,
      description: '',
      requestId: crypto.randomUUID(),
      expectedGuestId: 'test-author',
    }),
    { map: summary },
  );
});

test('invalid list data and nonadvancing cursors become retryable errors before state updates', async (t) => {
  let response: unknown;
  t.mock.method(globalThis, 'fetch', async () => Response.json(response));
  for (const invalid of [
    null,
    {},
    { items: null, nextCursor: null },
    { items: [summary] },
    { items: [summary], nextCursor: 'not-a-uuid' },
    { items: [], nextCursor: summary.id },
    { items: [summary], nextCursor: '00000000-0000-4000-8000-000000000002' },
    { items: [summary, summary], nextCursor: null },
    { items: Array(21).fill(summary), nextCursor: null },
    ...[
      { id: 'not-a-uuid' },
      { title: {} },
      { title: 'x' },
      { description: [] },
      { creatorName: null },
      { createdAt: 'not-a-date' },
      { description: 'x'.repeat(1001) },
    ].map((change) => ({ items: [{ ...summary, ...change }], nextCursor: null })),
  ]) {
    response = invalid;
    await assert.rejects(communityApi.list(), invalidData, JSON.stringify(invalid));
  }
  response = { items: [summary], nextCursor: summary.id };
  assert.deepEqual(await communityApi.list(), response);
  await assert.rejects(communityApi.list(summary.id), invalidData);
});

test('map reads validate identity, configuration, rules and exact tile costs', async (t) => {
  let response: unknown;
  t.mock.method(globalThis, 'fetch', async () => Response.json(response));
  for (const change of [
    { id: '00000000-0000-4000-8000-000000000002' },
    { configuration: null },
    { configuration: { ...detail().configuration, formatVersion: 999 } },
    { rules: null },
    { rules: {} },
    ...[
      { simulationVersion: '' },
      { rulesVersion: 3 },
      { maxTicks: 7201 },
      { maxTicks: 1.5 },
      { rotationAllowed: 'yes' },
      { placementBounds: null },
      { placementBounds: { minX: 1, maxX: 0, minY: 0, maxY: 1 } },
      { placementBounds: { minX: -1e308, maxX: 1e308, minY: 0, maxY: 1 } },
      { tileCosts: {} },
      { tileCosts: { unexpected: 1 } },
      { tileCosts: { ...detail().rules.tileCosts, extra: 1 } },
      { tileCosts: Object.fromEntries(Object.keys(detail().rules.tileCosts).map((id) => [id, 0])) },
    ].map((rules) => ({ rules: { ...detail().rules, ...rules } })),
  ]) {
    response = { map: { ...detail(), ...change } };
    await assert.rejects(communityApi.read(summary.id), invalidData);
  }
  for (const invalid of [null, {}, { map: [] }]) {
    response = invalid;
    await assert.rejects(communityApi.read(summary.id), invalidData);
  }
});

test('malformed successful publication responses remain retryable, and guest errors keep their codes', async (t) => {
  let response = new Response('not JSON', { status: 201 });
  t.mock.method(globalThis, 'fetch', async () => response);
  const { document, placement } = communityPublishingFixture();
  const input = {
    document,
    placement,
    requestId: crypto.randomUUID(),
    expectedGuestId: 'test-author',
    title: summary.title,
    description: '',
  };
  await assert.rejects(communityApi.publish(input), invalidData);
  response = Response.json({ map: { ...summary, id: 'invalid' } }, { status: 201 });
  await assert.rejects(communityApi.publish(input), invalidData);
  for (const [status, code] of [
    [401, 'GUEST_REQUIRED'],
    [409, 'GUEST_CHANGED'],
  ] as const) {
    response = Response.json({ error: 'Guest unavailable', code }, { status });
    await assert.rejects(
      communityApi.publish(input),
      (error: unknown) =>
        error instanceof CommunityApiError &&
        error.status === status &&
        error.code === code &&
        !error.retryable,
    );
  }
});
