import test from 'node:test';
import assert from 'node:assert/strict';
import { communityApi } from '../src/frontend/community-api';

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
