import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  appendAttempt,
  canAcceptExecution,
  mayReleaseReservation,
  mayStartAttempt,
  retryAfterAttempt,
} from '../src/community-verifier/lifecycle';
import type { Assignment, ExitEvidence } from '../src/community-verifier/lifecycle';
import { canonicalJson } from '../src/shared/community-canonical-json';
import { decodeStrictJson } from '../src/shared/strict-json';
import vector from './fixtures/canonical-v1/solved-course.json';
import { performCommunityWork } from '../src/community-verifier/work';
import { convertCommunityImport } from '../src/shared/community-profile';
import { readFile } from 'node:fs/promises';
import { createGame } from '../src/game/simulation';
import { replayRun } from '../src/game/run-evaluation';

const assignment: Assignment = {
  jobId: randomUUID(),
  runnerGeneration: randomUUID(),
  unitNumber: 0,
  attemptFence: randomUUID(),
  attemptNumber: 1,
};
const evidence: ExitEvidence = {
  elapsedMs: 4000,
  exitCode: 0,
  groupEmpty: true,
  timeout: false,
  oom: false,
  canceled: false,
  terminationFailed: false,
};
test('v4 complete-execution budget and physical exit evidence win over buffered success', () => {
  assert.equal(canAcceptExecution(evidence), true);
  assert.equal(canAcceptExecution({ ...evidence, elapsedMs: 5000 }), true);
  for (const patch of [
    { elapsedMs: 5000.01 },
    { elapsedMs: NaN },
    { elapsedMs: -1 },
    { exitCode: null },
    { exitCode: 1 },
    { groupEmpty: false },
    { timeout: true },
    { oom: true },
    { canceled: true },
    { terminationFailed: true },
  ])
    assert.equal(canAcceptExecution({ ...evidence, ...patch }), false);
  assert.equal(mayReleaseReservation(assignment, assignment, true), true);
  assert.equal(mayReleaseReservation(assignment, assignment, false), false);
  for (const patch of [
    { attemptFence: randomUUID() },
    { runnerGeneration: randomUUID() },
    { attemptNumber: 2 },
    { jobId: randomUUID() },
    { unitNumber: 1 as const },
  ])
    assert.equal(mayReleaseReservation(assignment, { ...assignment, ...patch }, true), false);
});
test('v4 retry deadlines never reset and exactly three automatic/five total attempts are possible', () => {
  assert.equal(mayStartAttempt(0, 119_999), true);
  assert.equal(mayStartAttempt(0, 120_000), false);
  const base = {
    admittedAt: 0,
    confirmedExit: true,
    failure: 'infrastructure' as const,
    operatorRetry: false,
  };
  assert.deepEqual(retryAfterAttempt({ ...base, attemptNumber: 1, finishedAt: 118_000 }), {
    state: 'terminal',
    code: 'QUEUE_AGE',
  });
  assert.deepEqual(retryAfterAttempt({ ...base, attemptNumber: 1, finishedAt: 1000 }), {
    state: 'retry-wait',
    readyAt: 6000,
  });
  assert.deepEqual(retryAfterAttempt({ ...base, attemptNumber: 2, finishedAt: 7000 }), {
    state: 'retry-wait',
    readyAt: 37000,
  });
  assert.deepEqual(retryAfterAttempt({ ...base, attemptNumber: 3, finishedAt: 38000 }), {
    state: 'operator-action',
  });
  assert.deepEqual(
    retryAfterAttempt({ ...base, attemptNumber: 3, finishedAt: 38000, operatorRetry: true }),
    { state: 'retry-wait', readyAt: 38000 },
  );
  assert.deepEqual(
    retryAfterAttempt({ ...base, attemptNumber: 5, finishedAt: 50000, operatorRetry: true }),
    { state: 'terminal', code: 'attempt-limit' },
  );
  assert.deepEqual(
    retryAfterAttempt({ ...base, attemptNumber: 1, finishedAt: 1000, failure: 'resource' }),
    { state: 'terminal', code: 'RESOURCE_BUDGET' },
  );
  assert.deepEqual(
    retryAfterAttempt({ ...base, attemptNumber: 1, finishedAt: 121000, confirmedExit: false }),
    { state: 'operator-action' },
  );
});
test('completed attempt journal appends once and rejects stale/conflicting/unconfirmed completion', () => {
  const complete = {
    ...assignment,
    artifactDigest: vector.engine.artifactDigest,
    startedAt: '2026-11-06T00:00:00Z',
    finishedAt: '2026-11-06T00:00:04Z',
    evidence,
    outcome: 'verified',
    resultHash: '0'.repeat(64),
  };
  const history = appendAttempt([], assignment, complete);
  assert.deepEqual(history, [complete]);
  assert.equal(appendAttempt(history, assignment, complete), history);
  assert.throws(
    () => appendAttempt(history, assignment, { ...complete, resultHash: '1'.repeat(64) }),
    /Conflicting/,
  );
  assert.throws(
    () => appendAttempt([], assignment, { ...complete, attemptFence: randomUUID() }),
    /Stale/,
  );
  assert.throws(
    () =>
      appendAttempt([], assignment, { ...complete, evidence: { ...evidence, groupEmpty: false } }),
    /journal/,
  );
});
test('prepared IPC carries large canonical configurations as objects within strict scalar limits', async () => {
  const original = decodeStrictJson(await readFile('src/game/levels/authored/prism-relay.json'));
  const sidecar = decodeStrictJson(
    await readFile('src/game/levels/authored/prism-relay.editor.json'),
  ) as { editor: unknown };
  const document = convertCommunityImport({ version: 2, level: original, editor: sidecar.editor }, [
    'community-preview-limit',
  ]);
  const output = await performCommunityWork(
    {
      contract: 'community-work-v1',
      kind: 'prepare',
      assignment,
      engine: vector.engine,
      levelId: vector.levelId,
      document,
    },
    { createGame, replayRun },
  );
  const decoded = decodeStrictJson(new TextEncoder().encode(canonicalJson(output))) as any;
  assert.equal(decoded.result.kind, 'ready');
  assert.ok(canonicalJson(decoded.result.candidate.configuration).length > 4096);
  assert.equal('canonicalConfiguration' in decoded.result.candidate, false);
});
for (const runtime of ['source', 'standalone'] as const)
  test(`real local ${runtime} CPU child verifies exact artifact and full-cap benchmark without DB credentials`, async () => {
    // Local process feasibility only: this does NOT prove Linux cgroups, descendants or systemd isolation.
    const child = spawn(
      process.execPath,
      runtime === 'source'
        ? [
            '--import',
            'tsx',
            'src/community-verifier/child.ts',
            path.resolve('artifacts/community-editor/engine'),
          ]
        : [
            'artifacts/community-editor/verifier/child.mjs',
            path.resolve('artifacts/community-editor/engine'),
          ],
      {
        cwd: process.cwd(),
        windowsHide: true,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const chunks: Buffer[] = [];
    let outputSize = 0;
    child.stdout.on('data', (data: Buffer) => {
      outputSize += data.length;
      if (outputSize > 256 * 1024) child.kill();
      else chunks.push(data);
    });
    const errors: Buffer[] = [];
    child.stderr.on('data', (data: Buffer) => {
      if (errors.reduce((sum, data) => sum + data.length, 0) < 4096) errors.push(data);
    });
    let timedOut = false;
    // Source mode also cold-loads TSX and WASM while other test files run in parallel.
    // Keep the bundled runtime deadline and production admission budgets unchanged.
    const timer = setTimeout(
      () => {
        timedOut = true;
        child.kill();
      },
      runtime === 'source' ? 15000 : 5000,
    );
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('close', resolve);
      child.once('error', reject);
    });
    child.stdin.end(
      canonicalJson({
        contract: 'community-work-v1',
        assignment,
        engine: vector.engine,
        kind: 'publish',
        candidateId: vector.candidateId,
        candidate: vector.candidate,
        proof: vector.proof,
      }),
    );
    try {
      assert.equal(await exited, 0, Buffer.concat(errors).toString());
      assert.equal(timedOut, false);
      const output = decodeStrictJson(Buffer.concat(chunks)) as any;
      assert.deepEqual(output.assignment, assignment);
      assert.equal(output.result.kind, 'verified');
      assert.equal(output.result.proofHash, vector.proofHash);
      assert.equal(output.result.benchmarkTicks, 7200);
      assert.deepEqual(output.result.outcome, vector.result);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) child.kill();
    }
  });
