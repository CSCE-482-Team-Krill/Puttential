import type {
  LeaderboardResponse,
  Placement,
  PuzzleProgress,
  PuzzleResponse,
  RunResponse,
  SavedResult,
  StartRunRequest,
  CompleteRunRequest,
} from '../src/shared/puzzle-contracts';
import { levelBounds } from '../src/game';
import { inventoryLevel } from './ui-polish-fixtures';
export const playerFixture = { id: 'guest-a', nickname: 'Fixture player' };
export function puzzleFixture(date = '2026-10-26', count = 2): PuzzleResponse {
  const configuration = inventoryLevel(count);
  return {
    id: `puzzle-${date}`,
    date,
    todayDate: '2026-10-26',
    title: 'Fixture putting course',
    seed: 'fixed',
    difficulty: 1,
    configuration,
    rules: {
      rulesVersion: 'fixture-rules-3.1',
      simulationVersion: 'fixture-engine-3.1',
      maxTicks: 7200,
      placementBounds: levelBounds(configuration),
      rotationAllowed: true,
      tileCosts: Object.fromEntries(configuration.fields.map((f, i) => [f.id, i ? 4 : 1])),
    },
    availability: {
      puzzleId: `puzzle-${date}`,
      revision: '0',
      publicationStatus: 'active',
      canceledAt: null,
      cancellationMessage: null,
    },
    serverNow: '2026-10-26T17:00:00Z',
    nextDailyAt: '2026-10-27T05:00:00Z',
  };
}
export function progressFixture(
  p = puzzleFixture(),
  revision = '0',
  guestId = playerFixture.id,
): PuzzleProgress {
  return {
    guestId,
    puzzleId: p.id,
    revision,
    attemptsStarted: 0,
    firstSolveAttempts: null,
    bestDaily: null,
    bestArchive: null,
  };
}
export function placementFixture(p = puzzleFixture()): Placement {
  let sequence = 0;
  return {
    levelId: p.configuration.id,
    levelVersion: p.configuration.version,
    rulesVersion: p.rules.rulesVersion,
    simulationVersion: p.rules.simulationVersion,
    commands: [...p.configuration.fields]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .flatMap((f) => [
        {
          type: 'move-field' as const,
          fieldId: f.id,
          xQ: Math.round(f.position.x * 1024),
          yQ: Math.round(f.position.y * 1024) || 0,
          sequence: sequence++,
        },
        { type: 'set-field-angle' as const, fieldId: f.id, angleQ: 0, sequence: sequence++ },
        {
          type: 'set-field-enabled' as const,
          fieldId: f.id,
          enabled: f.enabled,
          sequence: sequence++,
        },
      ]),
  };
}
export function startFixture(p = puzzleFixture()): StartRunRequest {
  return {
    expectedGuestId: playerFixture.id,
    requestId: '00000000-0000-4000-8000-000000000001',
    puzzleId: p.id,
    placement: placementFixture(p),
  };
}
export function acceptedFixture(start = startFixture(), p = puzzleFixture()): RunResponse {
  return {
    guestId: start.expectedGuestId,
    runId: `run-${start.requestId}`,
    requestId: start.requestId,
    puzzleId: p.id,
    attemptOrdinal: 1,
    startedAt: p.serverNow,
    runRevision: '1',
    availability: p.availability,
    progress: { ...progressFixture(p, '1', start.expectedGuestId), attemptsStarted: 1 },
    state: 'accepted',
    completion: null,
  };
}
export function savedFixture(
  base = acceptedFixture(),
  intent: CompleteRunRequest = { expectedGuestId: base.guestId, kind: 'terminal' },
): RunResponse & { state: 'saved' } {
  const result: SavedResult = {
    runId: base.runId,
    outcome: intent.kind === 'terminal' ? 'success' : intent.kind,
    verification: intent.kind === 'terminal' ? 'verified' : 'not-applicable',
    metrics:
      intent.kind === 'terminal'
        ? { forceCost: 5, tileCount: 2, completionTick: 120, pathLengthQ: 2048 }
        : null,
    dailyEligible: intent.kind === 'terminal',
    savedAt: '2026-10-26T17:01:00Z',
  };
  return {
    ...base,
    state: 'saved',
    runRevision: '3',
    completion: { intent, receivedAt: result.savedAt, dailyEligible: result.dailyEligible },
    result,
    progress: {
      ...base.progress,
      revision: '2',
      ...(intent.kind === 'terminal'
        ? { firstSolveAttempts: base.attemptOrdinal, bestDaily: result, bestArchive: result }
        : {}),
    },
  };
}
export function boardFixture(p = puzzleFixture(), viewer = playerFixture.id): LeaderboardResponse {
  const metrics = { forceCost: 5, tileCount: 2, completionTick: 120, pathLengthQ: 2048 };
  const row = {
    rank: 1,
    player: { ...playerFixture, id: viewer },
    metrics,
    firstSolveAttempts: 1,
    percentile: 0,
  };
  return {
    viewerGuestId: viewer,
    puzzleId: p.id,
    scope: 'daily',
    view: 'top',
    availability: p.availability,
    boardRevision: '1',
    rows: [row],
    me: { ...row, bestRunId: acceptedFixture().runId },
    totalPlayers: 1,
    nextCursor: null,
    asOf: p.serverNow,
    replayAccess: { available: false, unlocksAt: p.nextDailyAt },
    submissionClosed: false,
    pendingEligibleCount: 0,
    final: false,
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
