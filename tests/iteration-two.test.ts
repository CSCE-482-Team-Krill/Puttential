import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PuzzleApi, ApiError } from '../src/frontend/api';
import { RequestScheduler } from '../src/frontend/request-scheduler';
import { AuthoritativeState } from '../src/frontend/authoritative-state';
import {
  decodeBoard,
  decodePuzzle,
  decodeRun,
  validDate,
  validNickname,
  validateStart,
} from '../src/frontend/response-validation';
import { CourseSession } from '../src/frontend/course-session';
import { ProgressStorage, type RecoveryRecord } from '../src/frontend/progress-storage';
import { bootstrapGuest } from '../src/frontend/guest-session';
import { LeaderboardWindow } from '../src/frontend/leaderboard-state';
import { shareResult } from '../src/frontend/share-result';
import { dailyDelay, publishedContext } from '../src/frontend/course-context';
import { displayedForceCost } from '../src/frontend/score-display';
import { SubmissionQueue } from '../src/frontend/submission-queue';
import { acquireExecution } from '../src/frontend/run-ownership';
import {
  acceptedFixture,
  boardFixture,
  deferred,
  placementFixture,
  playerFixture,
  progressFixture,
  puzzleFixture,
  savedFixture,
  startFixture,
} from './iteration-two-fixtures';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = () => new Promise((resolve) => setImmediate(resolve));
function apiFixture(handler: (url: string, body: any) => Response | Promise<Response>) {
  return new PuzzleApi(new RequestScheduler(), async (url, init) =>
    handler(String(url), init?.body ? JSON.parse(String(init.body)) : null),
  );
}
function recordFixture(): RecoveryRecord {
  return {
    version: 1,
    persistence: 'memory',
    start: startFixture(),
    context: puzzleFixture(),
    owner: { tab: 'tab-a', document: 'doc-a' },
    phase: 'starting',
    cancelRequested: false,
    failures: 0,
    retryAt: 0,
    message: '',
  };
}

test('strict rules/limits/cost maps and metadata are separate from canonical Level', () => {
  const p = puzzleFixture();
  assert.equal(decodePuzzle(p).id, p.id);
  for (const maxTicks of [0, 7201])
    assert.throws(() => decodePuzzle({ ...p, rules: { ...p.rules, maxTicks } }));
  for (const maxTicks of [1, 7199, 7200])
    assert.equal(decodePuzzle({ ...p, rules: { ...p.rules, maxTicks } }).rules.maxTicks, maxTicks);
  const id = p.configuration.fields[0]!.id;
  for (const cost of [0, 1_000_001, 1.5])
    assert.throws(() =>
      decodePuzzle({
        ...p,
        rules: { ...p.rules, tileCosts: { ...p.rules.tileCosts, [id]: cost } },
      }),
    );
  for (const cost of [1, 999_999, 1_000_000])
    decodePuzzle({ ...p, rules: { ...p.rules, tileCosts: { ...p.rules.tileCosts, [id]: cost } } });
  assert.throws(() => decodePuzzle({ ...p, rules: { ...p.rules, tileCosts: {} } }));
  assert.throws(() =>
    decodePuzzle({ ...p, configuration: { ...p.configuration, rules: p.rules } }),
  );
  assert.throws(() => decodePuzzle({ ...p, date: '2026-02-30' }));
  assert.throws(() => decodePuzzle({ ...p, date: '2026-10-27' }));
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validNickname('ab'), false);
  assert.equal(validNickname('abc'), true);
  assert.equal(validNickname('x'.repeat(24)), true);
  assert.equal(validNickname('x'.repeat(25)), false);
  assert.equal(validNickname('ab\u200bc'), false);
  const draft = Object.fromEntries(
    p.configuration.fields.map((f) => [f.id, { enabled: true, position: f.position }]),
  );
  assert.equal(displayedForceCost(p.configuration, draft, p.rules.tileCosts), 5);
});
test('revision domains order exactly and do not regress across reversed responses', () => {
  const s = new AuthoritativeState(),
    old = acceptedFixture(),
    newer = savedFixture(old);
  newer.progress.revision = '9007199254740993';
  s.applyRun(newer);
  s.applyRun(old);
  assert.equal(s.runs.get(`${old.guestId}/${old.runId}`)?.state, 'saved');
  assert.equal(s.progress.get(`${old.guestId}/${old.puzzleId}`)?.revision, '9007199254740993');
  const canceled = {
    ...old.availability,
    revision: '2',
    publicationStatus: 'canceled' as const,
    canceledAt: old.startedAt,
    cancellationMessage: 'Broken course',
  };
  s.applyAvailability(canceled);
  s.applyAvailability(old.availability);
  assert.equal(s.availability.get(old.puzzleId)?.publicationStatus, 'canceled');
  assert.throws(() => s.applyProgress({ ...newer.progress, attemptsStarted: 99 }), /same revision/);
  assert.throws(() => decodeRun({ ...old, runRevision: '01' }));
});
test('receipt-critical dispatch beats recovery backlog while budgets and same-run serialization hold', async () => {
  const scheduler = new RequestScheduler(),
    order: string[] = [];
  const first = deferred<void>(),
    second = deferred<void>();
  const work = (name: string, gate?: Promise<void>) => async () => {
    order.push(name);
    await gate;
  };
  const a = scheduler.dispatch({
    priority: 'background',
    completion: true,
    runKey: 'older',
    work: work('inflight-completion', first.promise),
  });
  const b = scheduler.dispatch({
    priority: 'foreground',
    work: work('inflight-read', second.promise),
  });
  const c = scheduler.dispatch({
    priority: 'background',
    completion: true,
    runKey: 'archive',
    work: work('older-queued'),
  });
  const d = scheduler.dispatch({ priority: 'foreground', work: work('optional') });
  const e = scheduler.dispatch({
    priority: 'receipt',
    completion: true,
    runKey: 'new',
    work: work('initial-terminal'),
  });
  await flush();
  assert.equal(order.length, 2);
  first.resolve();
  await flush();
  assert.equal(order[2], 'initial-terminal');
  second.resolve();
  await Promise.all([a, b, c, d, e]);
  const gate = deferred<void>();
  let active = 0,
    maximum = 0;
  const tasks = [1, 2, 3].map(() =>
    scheduler.dispatch({
      priority: 'foreground',
      runKey: 'same',
      work: async () => {
        active++;
        maximum = Math.max(active, maximum);
        await gate.promise;
        active--;
      },
    }),
  );
  await flush();
  assert.equal(active, 1);
  gate.resolve();
  await Promise.all(tasks);
  assert.equal(maximum, 1);
});
test('interactive deadlines bound a transport which ignores AbortSignal', async () => {
  const api = new PuzzleApi(new RequestScheduler(), () => new Promise(() => {}));
  await assert.rejects(
    api.today({ timeoutMs: 15 }),
    (e: unknown) => e instanceof ApiError && e.code === 'REQUEST_UNKNOWN',
  );
});
test('guest bootstrap confirms cookie, handles denial, and never trusts POST identity', async () => {
  let reads = 0,
    creates = 0;
  const api = apiFixture((url) => {
    if (url === '/api/guest') {
      creates++;
      return json({ player: { ...playerFixture, id: 'unconfirmed-post' } });
    }
    reads++;
    return reads === 1 ? json({ error: 'No session' }, 401) : json({ player: playerFixture });
  });
  assert.deepEqual(await bootstrapGuest(api), playerFixture);
  assert.equal(creates, 1);
  assert.equal(reads, 2);
  const denied = apiFixture((url) =>
    url === '/api/guest' ? json({ player: playerFixture }) : json({ error: 'No cookies' }, 401),
  );
  await assert.rejects(bootstrapGuest(denied));
});
test('start is durable before POST; acceptance is stored before one playback; terminal survives retry', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  let plays = 0,
    starts = 0,
    completions = 0;
  const api = apiFixture(async (url, body) => {
    if (url === '/api/me') return json({ player: playerFixture });
    if (url === '/api/runs') {
      starts++;
      assert.deepEqual((await storage.list(playerFixture.id))[0]?.start, body);
      return json(acceptedFixture(body));
    }
    completions++;
    return json(savedFixture(acceptedFixture(), body));
  });
  const session = new CourseSession(
    api,
    storage,
    { tab: 'a', document: 'one' },
    {
      supports: () => true,
      play: () => {
        plays++;
        assert.equal(session.records.values().next().value?.phase, 'accepted');
      },
    },
    () => {},
    () => {},
    async () => ({ status: 'unavailable' }),
    () => startFixture().requestId,
  );
  const record = await session.start(puzzleFixture(), playerFixture, placementFixture());
  assert.equal(plays, 1, record.message);
  assert.equal(starts, 1);
  await session.finish(record.start.requestId, 'terminal', 120);
  await flush();
  await flush();
  assert.equal(completions, 1);
  assert.equal(record.phase, 'terminal');
  assert.equal((await storage.list(playerFixture.id))[0]?.intent?.kind, 'terminal');
  await session.finish(record.start.requestId, 'aborted', 0);
  assert.equal(record.intent?.kind, 'terminal');
  session.dispose();
});
test('canceled unknown start never plays after a late acknowledgement and aborts same counted run', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  const accepted = deferred<Response>();
  let plays = 0;
  const api = apiFixture((url, body) =>
    url === '/api/me'
      ? json({ player: playerFixture })
      : url === '/api/runs'
        ? accepted.promise
        : json(savedFixture(acceptedFixture(), body)),
  );
  const session = new CourseSession(
    api,
    storage,
    { tab: 'a', document: 'one' },
    {
      supports: () => true,
      play: () => {
        plays++;
      },
    },
    () => {},
    () => {},
    async () => ({ status: 'unavailable' }),
    () => startFixture().requestId,
  );
  const pending = session.start(puzzleFixture(), playerFixture, placementFixture());
  await flush();
  const id = startFixture().requestId;
  await session.cancel(id);
  accepted.resolve(json(acceptedFixture()));
  await pending;
  await flush();
  await flush();
  assert.equal(plays, 0);
  assert.equal(session.records.get(id)?.intent?.kind, 'aborted');
  assert.equal(session.records.get(id)?.response?.attemptOrdinal, 1);
  session.dispose();
});
test('ambiguous start retains payload and same ID; retry never launches recovered playback', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  let posted: unknown[] = [],
    queries = 0,
    plays = 0;
  const api = apiFixture((url, body) => {
    if (url === '/api/me') return json({ player: playerFixture });
    if (url.includes('/by-request/')) {
      queries++;
      return json({ error: 'Unknown' }, 404);
    }
    posted.push(body);
    if (posted.length === 1) throw new Error('Lost response');
    return json(acceptedFixture(body));
  });
  const session = new CourseSession(
    api,
    storage,
    { tab: 'a', document: 'one' },
    {
      supports: () => true,
      play: () => {
        plays++;
      },
    },
    () => {},
    () => {},
    async () => ({ status: 'unavailable' }),
    () => startFixture().requestId,
  );
  const record = await session.start(puzzleFixture(), playerFixture, placementFixture());
  assert.equal(record.phase, 'starting');
  await assert.rejects(
    session.start(puzzleFixture(), playerFixture, placementFixture()),
    /Resolve/,
  );
  await session.retry(record.start.requestId);
  assert.equal(queries, 1);
  assert.deepEqual(posted[0], posted[1]);
  assert.equal(plays, 0);
  session.dispose();
});
test('observing another tab never interrupts; busy ownership does not fall back to takeover', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  const record = { ...recordFixture(), phase: 'accepted' as const, response: acceptedFixture() };
  await storage.put(record);
  let writes = 0;
  const api = apiFixture(() => {
    writes++;
    return json(acceptedFixture());
  });
  const session = new CourseSession(
    api,
    storage,
    { tab: 'b', document: 'two' },
    { supports: () => true, play: () => assert.fail('No recovery playback') },
    () => {},
    () => {},
    async () => ({ status: 'owned-elsewhere' }),
  );
  await session.recover(playerFixture.id);
  assert.equal(writes, 1); // Authenticated read, never an inferred abort.
  await assert.rejects(session.interrupt(record.start.requestId), /another tab/);
  assert.equal(writes, 1);
  assert.equal(storage.mode, 'memory');
  session.dispose();
});
test('memory recovery rejects changed start, changed completion and backward phase', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  const r = recordFixture();
  await storage.put(r);
  await assert.rejects(storage.put({ ...r, start: { ...r.start, puzzleId: 'different' } }));
  const pending: RecoveryRecord = {
    ...r,
    phase: 'pending',
    intent: { kind: 'terminal', expectedGuestId: r.start.expectedGuestId },
  };
  await storage.put(pending);
  await assert.rejects(
    storage.put({
      ...pending,
      intent: { kind: 'aborted', observedTick: 0, expectedGuestId: r.start.expectedGuestId },
    }),
  );
  await assert.rejects(storage.put(r));
});
test('infrastructure-blocked verification retains intent/eligibility; saved cancellation remains historical', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  const base = acceptedFixture(),
    saved = savedFixture(base);
  const processing = {
    ...base,
    state: 'processing',
    runRevision: '2',
    completion: saved.completion,
    verification: {
      status: 'blocked',
      issue: { code: 'RUNTIME_MISSING', message: 'Restore runtime' },
    },
    retryAfterMs: 30_000,
  };
  assert.equal(decodeRun(processing).state, 'processing');
  const record: RecoveryRecord = {
    ...recordFixture(),
    phase: 'pending',
    response: base,
    intent: saved.completion.intent,
  };
  const state = new AuthoritativeState();
  let calls = 0;
  const queue = new SubmissionQueue(
    apiFixture(() => json(++calls === 1 ? processing : saved)),
    storage,
    state,
    () => {},
    () => {},
  );
  await queue.enqueue(record, true);
  assert.equal(record.phase, 'pending');
  assert.equal(record.response?.state, 'processing');
  assert.equal(record.intent?.kind, 'terminal');
  assert.match(record.message, /delayed/);
  await queue.enqueue(record, false, true);
  assert.equal(record.phase, 'terminal');
  assert.equal(record.response?.state, 'saved');
  queue.dispose();
});
test('viewer-bound pages discard A data under B, including unsolved me null and old cursors', async () => {
  const a = deferred<Response>();
  let changed = 0;
  const api = apiFixture(() => a.promise);
  const window = new LeaderboardWindow(
    api,
    'guest-b',
    puzzleFixture().id,
    'daily',
    'around-me',
    () => {
      changed++;
    },
  );
  const request = window.load();
  a.resolve(json({ ...boardFixture(), view: 'around-me', me: null }));
  await request;
  assert.equal(window.board, null);
  assert.equal(changed, 1);
  assert.match(window.message, /session changed/);
  const b = boardFixture(puzzleFixture(), 'guest-b');
  b.me = null;
  b.rows = [];
  b.totalPlayers = 0;
  assert.equal(decodeBoard(b).viewerGuestId, 'guest-b');
});
test('obsolete board generations cannot overwrite latest even if transport returns late', async () => {
  const delayed = deferred<Response>();
  let calls = 0;
  const api = apiFixture(() =>
    ++calls === 1 ? delayed.promise : json({ ...boardFixture(), boardRevision: '2' }),
  );
  const window = new LeaderboardWindow(
    api,
    playerFixture.id,
    puzzleFixture().id,
    'daily',
    'top',
    () => {},
  );
  const old = window.load();
  await flush();
  await window.load();
  delayed.resolve(json(boardFixture()));
  await old;
  assert.equal(window.board?.boardRevision, '2');
});
test('pagination restarts at most once per action and never appends mixed revisions', async () => {
  let calls = 0;
  const api = apiFixture(() => {
    calls++;
    return calls === 1
      ? json({ ...boardFixture(), nextCursor: 'viewer-a-rev1' })
      : json({ error: 'Changed', code: 'BOARD_REVISION_CHANGED', retryable: false }, 409);
  });
  const window = new LeaderboardWindow(
    api,
    playerFixture.id,
    puzzleFixture().id,
    'daily',
    'top',
    () => {},
  );
  await window.load();
  await window.load(true);
  assert.equal(calls, 3);
  assert.equal(window.board, null);
  assert.match(window.message, /Standings are changing/);
});
test('sharing attributes rank to exact run/viewer/scope; worse/equal and archive best cannot borrow it', () => {
  const p = puzzleFixture(),
    result = savedFixture().result,
    board = boardFixture();
  const input = {
    date: p.date,
    puzzleId: p.id,
    guestId: playerFixture.id,
    scope: 'daily' as const,
    result,
    firstSolveAttempts: 1,
    availability: p.availability,
    board,
    origin: 'https://example.test',
  };
  assert.match(shareResult(input), /Daily rank #1/);
  for (const other of [
    { ...result, runId: 'worse' },
    { ...result, runId: 'equal-score-other-id' },
  ])
    assert.doesNotMatch(shareResult({ ...input, result: other }), /rank #/);
  assert.doesNotMatch(shareResult({ ...input, guestId: 'guest-b' }), /rank #/);
  assert.doesNotMatch(shareResult({ ...input, scope: 'archive' }), /rank #/);
  assert.match(shareResult({ ...input, availability: null }), /Ranking status unavailable/);
  const canceled = {
    ...p.availability,
    revision: '1',
    publicationStatus: 'canceled' as const,
    canceledAt: p.serverNow,
    cancellationMessage: 'Broken',
  };
  assert.doesNotMatch(shareResult({ ...input, availability: canceled }), /rank #|daily window/);
  assert.match(shareResult({ ...input, availability: canceled }), /Course canceled/);
  assert.doesNotMatch(shareResult(input), /fieldId|sequence|angle|guest-a/);
});
test('source-only rollover retains content identity and monotonic scheduling ignores client clock/DST', () => {
  const p = puzzleFixture(),
    same = { ...p, todayDate: '2026-10-27' };
  assert.equal(publishedContext(p).key, publishedContext(same).key);
  assert.notEqual(publishedContext(p).source, publishedContext(same).source);
  assert.equal(
    dailyDelay('2026-11-01T05:00:00Z', '2026-11-02T06:00:00Z', 100, 1100),
    25 * 3600 * 1000 - 1000,
  );
});
test('nonwaiting ownership returns busy without claiming storage failure', async () => {
  const locks = {
    request: async (_name: string, _opts: unknown, fn: (lock: null) => void) => fn(null),
  } as unknown as LockManager;
  assert.deepEqual(await acquireExecution('request', locks), { status: 'owned-elsewhere' });
});

test('setup envelopes enforce complete canonical inventory, angle endpoints and safe integers', () => {
  const p = puzzleFixture(),
    start = startFixture(p);
  validateStart(start, p);
  for (const angleQ of [-1, 3600, 1.2]) {
    const next = structuredClone(start);
    next.placement.commands[1] = {
      type: 'set-field-angle',
      fieldId: p.configuration.fields[0]!.id,
      sequence: 1,
      angleQ,
    };
    assert.throws(() => validateStart(next, p));
  }
  for (const angleQ of [0, 3598, 3599]) {
    const next = structuredClone(start);
    next.placement.commands[1] = {
      type: 'set-field-angle',
      fieldId: p.configuration.fields[0]!.id,
      sequence: 1,
      angleQ,
    };
    validateStart(next, p);
  }
  assert.throws(() =>
    validateStart(
      { ...start, placement: { ...start.placement, commands: start.placement.commands.slice(1) } },
      p,
    ),
  );
  const next = structuredClone(start);
  next.placement.commands[0] = {
    type: 'move-field',
    fieldId: p.configuration.fields[0]!.id,
    sequence: 0,
    xQ: Number.MAX_SAFE_INTEGER + 1,
    yQ: 0,
  };
  assert.throws(() => validateStart(next, p));
  for (const count of [255, 256]) decodePuzzle(puzzleFixture('2026-10-26', count));
  assert.throws(() => decodePuzzle(puzzleFixture('2026-10-26', 257)));
});
test('blocked database initialization and stale opens cannot replace selected memory fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const request: any = {};
  const storage = new ProgressStorage();
  const opening = storage.initialize({ open: () => request } as unknown as IDBFactory);
  t.mock.timers.tick(3000);
  await opening;
  assert.equal(storage.mode, 'memory');
  let closed = false;
  request.result = {
    close: () => {
      closed = true;
    },
  };
  request.onsuccess();
  assert.equal(closed, true);
  assert.equal(storage.mode, 'memory');
});
test('stalled ownership is bounded and a late lock callback releases without taking over', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let late!: (lock: object) => Promise<void>;
  const locks = {
    request: (_n: string, _o: unknown, callback: typeof late) => {
      late = callback;
      return new Promise(() => {});
    },
  } as unknown as LockManager;
  const result = acquireExecution('request', locks);
  t.mock.timers.tick(1000);
  assert.deepEqual(await result, { status: 'unavailable' });
  await late({});
});
test('Retry-After pauses before dispatch, never creates another run and keeps intent', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  const base = acceptedFixture(),
    saved = savedFixture(base);
  const record: RecoveryRecord = {
    ...recordFixture(),
    phase: 'pending',
    response: base,
    intent: saved.completion.intent,
  };
  let calls = 0;
  const api = apiFixture(() => {
    calls++;
    return calls === 1
      ? new Response(JSON.stringify({ error: 'Busy', code: 'ADMISSION', retryable: true }), {
          status: 429,
          headers: { 'Retry-After': '30' },
        })
      : json(saved);
  });
  const queue = new SubmissionQueue(
    api,
    storage,
    new AuthoritativeState(),
    () => {},
    () => {},
  );
  await queue.enqueue(record, true);
  assert.equal(record.phase, 'pending');
  assert.equal(calls, 1);
  await queue.enqueue(record, false, true);
  assert.equal(calls, 1);
  t.mock.timers.tick(30_000);
  await flush();
  await flush();
  assert.equal(calls, 2);
  assert.equal(record.phase, 'terminal');
  queue.dispose();
});
test('leaderboard viewer-change error discards its cursor rather than retrying it under another guest', async () => {
  let calls = 0,
    reconciled = 0;
  const cursors: string[] = [];
  const api = apiFixture((url) => {
    if (url === '/api/me') return json({ player: { ...playerFixture, id: 'guest-b' } });
    cursors.push(new URL(url, 'https://example.test').searchParams.get('cursor') ?? '');
    calls++;
    return calls === 1
      ? json({ ...boardFixture(), nextCursor: 'a-only-cursor' })
      : json(
          { error: 'Viewer changed', code: 'LEADERBOARD_VIEWER_CHANGED', retryable: false },
          409,
        );
  });
  const window = new LeaderboardWindow(
    api,
    playerFixture.id,
    puzzleFixture().id,
    'daily',
    'top',
    () => {
      reconciled++;
    },
  );
  await window.load();
  await window.load(true);
  assert.equal(window.board, null);
  assert.equal(reconciled, 1);
  assert.equal(calls, 2);
  assert.deepEqual(cursors, ['', 'a-only-cursor']);
});
test('a contradictory viewer response with an unchanged confirmed cookie stops for manual refresh', async () => {
  let reconciliations = 0,
    boardReads = 0;
  const api = apiFixture((url) =>
    url === '/api/me'
      ? json({ player: playerFixture })
      : (boardReads++, json(boardFixture(puzzleFixture(), 'other-viewer'))),
  );
  const window = new LeaderboardWindow(
    api,
    playerFixture.id,
    puzzleFixture().id,
    'daily',
    'top',
    () => {
      reconciliations++;
    },
  );
  await window.load();
  assert.equal(window.board, null);
  assert.equal(boardReads, 1);
  assert.equal(reconciliations, 0);
  assert.match(window.message, /Refresh/);
});

test('distinct tabs can start distinct requests for the same puzzle without interrupting observed execution', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  const observed: RecoveryRecord = {
    ...recordFixture(),
    phase: 'accepted',
    response: acceptedFixture(),
  };
  await storage.put(observed);
  let starts = 0,
    completions = 0,
    plays = 0;
  const api = apiFixture((url, body) => {
    if (url === '/api/me') return json({ player: playerFixture });
    if (url.includes('/by-request/')) return json(acceptedFixture());
    if (url === '/api/runs') {
      starts++;
      return json({
        ...acceptedFixture(body),
        attemptOrdinal: 2,
        progress: { ...progressFixture(puzzleFixture(), '2'), attemptsStarted: 2 },
      });
    }
    completions++;
    return json({ error: 'Unexpected completion' }, 500);
  });
  const session = new CourseSession(
    api,
    storage,
    { tab: 'other-tab', document: 'other-document' },
    {
      supports: () => true,
      play: () => {
        plays++;
      },
    },
    () => {},
    () => {},
    async () => ({ status: 'unavailable' }),
    () => '00000000-0000-4000-8000-000000000002',
  );
  await session.recover(playerFixture.id);
  await session.start(puzzleFixture(), playerFixture, placementFixture());
  assert.equal(starts, 1);
  assert.equal(plays, 1);
  assert.equal(completions, 0);
  assert.equal(observed.response?.state, 'accepted');
  session.dispose();
});
test('saved lifecycle merges current cancellation at an independent availability revision', () => {
  const state = new AuthoritativeState(),
    saved = savedFixture();
  state.applyRun(saved);
  const newer = {
    ...saved,
    availability: {
      ...saved.availability,
      revision: '1',
      publicationStatus: 'canceled' as const,
      canceledAt: saved.startedAt,
      cancellationMessage: 'Broken course',
    },
  };
  const result = state.applyRun(newer);
  assert.equal(result.state, 'saved');
  assert.equal(result.availability.publicationStatus, 'canceled');
  assert.deepEqual(result.state === 'saved' && result.result, saved.result);
  assert.equal(state.applyRun(saved).availability.publicationStatus, 'canceled');
});
test('persistence retry does not silently migrate an active memory-only run', async () => {
  const storage = new ProgressStorage();
  await storage.initialize(undefined);
  const record = recordFixture();
  await storage.put(record);
  storage.mode = 'durable';
  let transactions = 0;
  (storage as any).transaction = () => {
    transactions++;
    throw new Error('Must not migrate an active run');
  };
  await storage.put({ ...record, phase: 'accepted', response: acceptedFixture() });
  assert.equal(transactions, 0);
});
test('guest bootstrap total deadline bounds stalled calls without late confirmation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = apiFixture(() => new Promise(() => {}));
  const pending = bootstrapGuest(api);
  t.mock.timers.tick(25_000);
  await assert.rejects(pending, /Competitive session unavailable/);
});
