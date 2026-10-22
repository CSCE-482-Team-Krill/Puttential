import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictError, NotFoundError, ValidationError } from '../src/backend/errors';
import { apiError, HttpError, jsonBody, parseAttempt, parseSolution } from '../src/backend/http';
import { centralDateString } from '../src/backend/puzzle-date';

test('daily dates follow Central midnight across daylight saving time', () => {
  assert.equal(centralDateString(new Date('2026-07-02T04:59:59Z')), '2026-07-01');
  assert.equal(centralDateString(new Date('2026-07-02T05:00:00Z')), '2026-07-02');
  assert.equal(centralDateString(new Date('2026-01-02T05:59:59Z')), '2026-01-01');
  assert.equal(centralDateString(new Date('2026-01-02T06:00:00Z')), '2026-01-02');
});

test('attempt boundary rejects malformed metrics and unverified identities', () => {
  assert.deepEqual(parseAttempt({ puzzleId: 'daily', success: true, tileCount: 2 }), {
    puzzleId: 'daily',
    success: true,
    tileCount: 2,
  });
  for (const body of [
    null,
    [],
    { puzzleId: 3 },
    { puzzleId: 'daily', success: 'false' },
    { puzzleId: 'daily', tileCount: 0.5 },
    { puzzleId: 'daily', forceCost: 2147483648 },
    { puzzleId: 'daily', simulationTime: -1 },
    { puzzleId: 'daily', pathLength: Infinity },
    { puzzleId: 'daily', userId: 'someone-else' },
  ]) {
    assert.throws(() => parseAttempt(body), HttpError);
  }
});

test('solution boundary validates replay commands before calling a service', () => {
  const body = {
    puzzleId: 'daily',
    attemptId: 'attempt',
    placementData: {
      levelId: 'level',
      levelVersion: 4,
      commands: [
        { type: 'move-field', fieldId: 'force', xQ: 0, yQ: -20, sequence: 0 },
        { type: 'set-field-enabled', fieldId: 'force', enabled: true, sequence: 1 },
      ],
    },
  };
  assert.deepEqual(parseSolution(body), body);
  const versioned = {
    ...body,
    placementData: { ...body.placementData, simulationVersion: 'puttential-core-1' },
  };
  assert.deepEqual(parseSolution(versioned), versioned);
  for (const simulationVersion of ['', '   ', 7, 'x'.repeat(201)]) {
    assert.throws(
      () => parseSolution({ ...body, placementData: { ...body.placementData, simulationVersion } }),
      HttpError,
    );
  }
  for (const commands of [
    [{ type: 'unknown', fieldId: 'force', sequence: 0 }],
    [{ type: 'set-field-enabled', fieldId: 'force', enabled: 'true', sequence: 0 }],
    [body.placementData.commands[0], body.placementData.commands[0]],
    [{ type: 'move-field', fieldId: 'force', xQ: 0.1, yQ: 0, sequence: 0 }],
  ]) {
    assert.throws(
      () => parseSolution({ ...body, placementData: { ...body.placementData, commands } }),
      HttpError,
    );
  }
});

test('HTTP failures preserve useful status codes', async () => {
  assert.equal(apiError(new HttpError(400, 'Bad request')).status, 400);
  assert.equal(apiError(new ValidationError('The attempt does not belong here.')).status, 400);
  assert.equal(apiError(new NotFoundError('Puzzle not found: daily')).status, 404);
  assert.equal(apiError(new ConflictError('A solution already exists for attempt x.')).status, 409);
  // A concurrent duplicate insert surfaces as Prisma's unique-constraint code.
  const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  assert.equal(apiError(duplicate).status, 409);
  // Status codes come from the error type, never from message text.
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(apiError(new Error('Puzzle not found: daily')).status, 503);
  } finally {
    console.error = original;
  }
  const response = new Request('http://localhost/api/attempts', { method: 'POST', body: '{' });
  await assert.rejects(() => jsonBody(response), HttpError);
});
