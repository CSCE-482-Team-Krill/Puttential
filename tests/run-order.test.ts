import assert from 'node:assert/strict';
import test from 'node:test';
import { newestRunRecords } from '../src/frontend/run-order';
import type { RecoveryRecord } from '../src/frontend/progress-storage';
import {
  acceptedFixture,
  puzzleFixture,
  savedFixture,
  startFixture,
} from './iteration-two-fixtures';

function record(ordinal: number, startedAt: string): RecoveryRecord {
  const puzzle = puzzleFixture();
  const start = {
    ...startFixture(puzzle),
    requestId: `00000000-0000-4000-8000-${ordinal.toString().padStart(12, '0')}`,
  };
  const accepted = {
    ...acceptedFixture(start, puzzle),
    attemptOrdinal: ordinal,
    startedAt,
  };
  return {
    version: 1,
    persistence: 'durable',
    start,
    context: puzzle,
    owner: { tab: 'test-tab', document: 'test-document' },
    phase: 'terminal',
    cancelRequested: false,
    response: savedFixture(accepted),
    intent: { expectedGuestId: start.expectedGuestId, kind: 'terminal' },
    failures: 0,
    retryAt: 0,
    message: 'Saved and verified.',
  };
}

test('runs use authoritative start time and attempt ordinal instead of map order', () => {
  const puzzle = puzzleFixture();
  const first = record(1, '2026-10-26T15:00:00Z');
  const third = record(3, '2026-10-26T16:00:00Z');
  const second = record(2, '2026-10-26T16:00:00Z');
  assert.deepEqual(
    newestRunRecords([second, first, third], puzzle.id).map((run) => run.response?.attemptOrdinal),
    [3, 2, 1],
  );
});

test('an unresolved start stays visible above accepted history', () => {
  const puzzle = puzzleFixture();
  const pending = { ...record(1, '2026-10-26T15:00:00Z'), response: undefined };
  pending.phase = 'starting';
  assert.equal(
    newestRunRecords([record(2, '2026-10-26T16:00:00Z'), pending], puzzle.id)[0],
    pending,
  );
});
