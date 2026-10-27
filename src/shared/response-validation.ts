import { parseLevel, isCourseObject } from '../game';
import { LIMITS } from '../shared/puzzle-contracts';
import type {
  ArchiveResponse,
  LeaderboardResponse,
  Player,
  ProgressResponse,
  PuzzleResponse,
  RunResponse,
} from '../shared/puzzle-contracts';
import type { StartRunRequest } from '../shared/puzzle-contracts';

type Obj = Record<string, any>;
function check(condition: unknown, message = 'Invalid puzzle service data'): asserts condition {
  if (!condition) throw new Error(message);
}
const obj = (x: any): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x: any) => typeof x === 'string' && x.length > 0;
export const validDate = (x: any): x is string =>
  typeof x === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
const instant = (x: any) =>
  typeof x === 'string' &&
  /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(x) &&
  Number.isFinite(Date.parse(x));
const integer = (x: any, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(x) && x >= min && x <= max;
const revision = (x: any) => typeof x === 'string' && /^(0|[1-9][0-9]*)$/.test(x);
const nullable = (x: any, validate: (v: any) => boolean) => x === null || validate(x);
export function validNickname(value: string) {
  const name = value.trim();
  return (
    [...name].length >= LIMITS.nicknameMin &&
    [...name].length <= LIMITS.nicknameMax &&
    !/[\p{Cc}\p{Cf}]/u.test(name)
  );
}
function player(x: any): boolean {
  return obj(x) && text(x.id) && typeof x.nickname === 'string' && validNickname(x.nickname);
}
function availability(x: any, id: string): boolean {
  return (
    obj(x) &&
    x.puzzleId === id &&
    revision(x.revision) &&
    (x.publicationStatus === 'active'
      ? x.canceledAt === null && x.cancellationMessage === null
      : x.publicationStatus === 'canceled' && instant(x.canceledAt) && text(x.cancellationMessage))
  );
}
function metrics(x: any): boolean {
  return (
    obj(x) &&
    integer(x.forceCost, 0, LIMITS.fields * LIMITS.maxCost) &&
    integer(x.tileCount, 0, LIMITS.fields) &&
    integer(x.completionTick, 0, LIMITS.maxTicks) &&
    integer(x.pathLengthQ)
  );
}
function saved(x: any): boolean {
  return (
    obj(x) &&
    text(x.runId) &&
    instant(x.savedAt) &&
    typeof x.dailyEligible === 'boolean' &&
    (['aborted', 'interrupted'].includes(x.outcome)
      ? x.verification === 'not-applicable' && x.metrics === null && !x.dailyEligible
      : ['success', 'stopped', 'water', 'lava', 'out-of-bounds', 'timeout'].includes(x.outcome) &&
        x.verification === 'verified' &&
        metrics(x.metrics))
  );
}
function progress(x: any): boolean {
  return (
    obj(x) &&
    text(x.guestId) &&
    text(x.puzzleId) &&
    revision(x.revision) &&
    integer(x.attemptsStarted) &&
    nullable(x.firstSolveAttempts, (v) => integer(v, 1, x.attemptsStarted)) &&
    nullable(x.bestDaily, saved) &&
    nullable(x.bestArchive, saved) &&
    [x.bestDaily, x.bestArchive].every(
      (v) => v === null || (v.outcome === 'success' && x.firstSolveAttempts !== null),
    ) &&
    (x.bestDaily === null || x.bestDaily.dailyEligible)
  );
}
export function decodePlayer(x: unknown): { player: Player } {
  check(obj(x) && player(x.player));
  return x as { player: Player };
}
export function decodePuzzle(x: unknown): PuzzleResponse {
  check(obj(x));
  const configuration = parseLevel(x.configuration);
  const r = x.rules;
  check(
    text(x.id) &&
      text(x.title) &&
      typeof x.seed === 'string' &&
      integer(x.difficulty) &&
      validDate(x.date) &&
      validDate(x.todayDate) &&
      x.date <= x.todayDate &&
      instant(x.serverNow) &&
      instant(x.nextDailyAt) &&
      availability(x.availability, x.id),
  );
  check(
    obj(r) &&
      text(r.rulesVersion) &&
      text(r.simulationVersion) &&
      integer(r.maxTicks, 1, LIMITS.maxTicks) &&
      typeof r.rotationAllowed === 'boolean',
  );
  const b = r.placementBounds;
  check(
    obj(b) &&
      ['minX', 'minY', 'maxX', 'maxY'].every((k) => Number.isFinite(b[k])) &&
      b.minX < b.maxX &&
      b.minY < b.maxY,
  );
  const fields = configuration.fields.filter((f) => !isCourseObject(f.force));
  check(
    fields.length <= LIMITS.fields &&
      obj(r.tileCosts) &&
      Object.keys(r.tileCosts).length === fields.length &&
      fields.every((f) => integer(r.tileCosts[f.id], 1, LIMITS.maxCost)),
  );
  return { ...x, configuration } as PuzzleResponse;
}
export function decodeProgress(x: unknown): ProgressResponse {
  check(obj(x) && progress(x.progress) && availability(x.availability, x.progress.puzzleId));
  return x as ProgressResponse;
}
export function decodeRun(x: unknown): RunResponse {
  check(
    obj(x) &&
      text(x.runId) &&
      text(x.requestId) &&
      text(x.guestId) &&
      text(x.puzzleId) &&
      integer(x.attemptOrdinal, 1) &&
      instant(x.startedAt) &&
      revision(x.runRevision) &&
      BigInt(x.runRevision) >= BigInt(1) &&
      progress(x.progress) &&
      x.progress.guestId === x.guestId &&
      x.progress.puzzleId === x.puzzleId &&
      availability(x.availability, x.puzzleId),
  );
  if (x.state === 'accepted') check(x.completion === null);
  else if (x.state === 'canceled')
    check(
      obj(x.cancellation) &&
        x.cancellation.code === 'PUZZLE_CANCELED' &&
        instant(x.cancellation.canceledAt) &&
        text(x.cancellation.message),
    );
  else {
    const c = x.completion;
    check(
      obj(c) &&
        instant(c.receivedAt) &&
        typeof c.dailyEligible === 'boolean' &&
        obj(c.intent) &&
        c.intent.expectedGuestId === x.guestId &&
        (c.intent.kind === 'terminal' ||
          (['aborted', 'interrupted'].includes(c.intent.kind) &&
            integer(c.intent.observedTick, 0, LIMITS.maxTicks) &&
            !c.dailyEligible)),
    );
    if (x.state === 'saved')
      check(
        saved(x.result) && x.result.runId === x.runId && x.result.dailyEligible === c.dailyEligible,
      );
    else if (x.state === 'rejected')
      check(
        obj(x.rejection) &&
          ['INVALID_SETUP', 'INVALID_REPLAY'].includes(x.rejection.code) &&
          text(x.rejection.message),
      );
    else
      check(
        x.state === 'processing' &&
          integer(x.retryAfterMs) &&
          obj(x.verification) &&
          ['queued', 'running', 'retry-wait', 'blocked'].includes(x.verification.status) &&
          nullable(x.verification.issue, (v) => obj(v) && text(v.code) && text(v.message)),
      );
  }
  return x as RunResponse;
}
function row(x: any): boolean {
  return (
    obj(x) &&
    integer(x.rank, 1) &&
    player(x.player) &&
    metrics(x.metrics) &&
    integer(x.firstSolveAttempts, 1) &&
    Number.isFinite(x.percentile) &&
    x.percentile >= 0 &&
    x.percentile <= 100
  );
}
export function decodeBoard(x: unknown): LeaderboardResponse {
  check(
    obj(x) &&
      text(x.viewerGuestId) &&
      text(x.puzzleId) &&
      ['daily', 'archive'].includes(x.scope) &&
      ['top', 'around-me'].includes(x.view) &&
      availability(x.availability, x.puzzleId) &&
      revision(x.boardRevision) &&
      Array.isArray(x.rows) &&
      x.rows.length <= LIMITS.pageSize &&
      x.rows.every(row) &&
      nullable(x.me, (v) => row(v) && text(v.bestRunId) && v.player.id === x.viewerGuestId) &&
      integer(x.totalPlayers) &&
      nullable(x.nextCursor, text) &&
      instant(x.asOf) &&
      typeof x.submissionClosed === 'boolean' &&
      integer(x.pendingEligibleCount) &&
      typeof x.final === 'boolean',
  );
  check(!x.final || (x.scope === 'daily' && x.submissionClosed && x.pendingEligibleCount === 0));
  check(x.totalPlayers !== 0 || (x.me === null && x.rows.length === 0));
  check(
    x.availability.publicationStatus !== 'canceled' ||
      (x.rows.length === 0 &&
        x.me === null &&
        x.totalPlayers === 0 &&
        x.nextCursor === null &&
        !x.final),
  );
  check(new Set(x.rows.map((v: any) => v.player.id)).size === x.rows.length);
  return x as LeaderboardResponse;
}
export function decodeArchive(x: unknown): ArchiveResponse {
  check(
    obj(x) &&
      text(x.guestId) &&
      Array.isArray(x.items) &&
      x.items.length <= LIMITS.pageSize &&
      nullable(x.nextCursor, text),
  );
  check(
    x.items.every(
      (v: any) =>
        obj(v) &&
        text(v.id) &&
        validDate(v.date) &&
        text(v.title) &&
        integer(v.difficulty) &&
        ['unplayed', 'attempted', 'solved'].includes(v.status) &&
        revision(v.progressRevision) &&
        availability(v.availability, v.id),
    ),
  );
  check(x.items.every((v: any, i: number) => i === 0 || x.items[i - 1].date >= v.date));
  return x as ArchiveResponse;
}

/** Cheap transport validation; canonical geometry/replay remain the engine owner's job. */
export function validateStart(start: StartRunRequest, puzzle: PuzzleResponse) {
  const placement = start.placement;
  check(
    start.puzzleId === puzzle.id &&
      text(start.expectedGuestId) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        start.requestId,
      ),
    'Invalid start identity.',
  );
  check(
    placement.levelId === puzzle.configuration.id &&
      placement.levelVersion === puzzle.configuration.version &&
      placement.rulesVersion === puzzle.rules.rulesVersion &&
      placement.simulationVersion === puzzle.rules.simulationVersion,
    'Setup versions do not match this course.',
  );
  const inventory = puzzle.configuration.fields
    .filter((f) => !isCourseObject(f.force))
    .map((f) => f.id)
    .sort();
  const types = puzzle.rules.rotationAllowed
    ? ['move-field', 'set-field-angle', 'set-field-enabled']
    : ['move-field', 'set-field-enabled'];
  check(
    placement.commands.length === inventory.length * types.length &&
      placement.commands.length <= LIMITS.commands,
    'Setup must include the complete tile inventory.',
  );
  inventory.forEach((id, i) =>
    types.forEach((type, j) => {
      const sequence = i * types.length + j,
        command = placement.commands[sequence];
      check(
        command && command.type === type && command.fieldId === id && command.sequence === sequence,
        'Invalid setup command order.',
      );
      if (command.type === 'move-field')
        check(
          Number.isSafeInteger(command.xQ) && Number.isSafeInteger(command.yQ),
          'Invalid tile position.',
        );
      else if (command.type === 'set-field-angle')
        check(integer(command.angleQ, 0, 3599), 'Invalid tile angle.');
      else check(typeof command.enabled === 'boolean', 'Invalid tile state.');
    }),
  );
  check(
    new TextEncoder().encode(JSON.stringify(start)).length <= LIMITS.bodyBytes,
    'Setup is too large.',
  );
}
