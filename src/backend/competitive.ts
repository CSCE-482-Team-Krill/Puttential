import { createHash, createHmac, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { Puzzle, CompetitiveRun, GuestProgress, Guest } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { centralDateString, centralMidnight, shiftDate, nextDailyAt } from './puzzle-date';
import { parseLevel } from '../game';
import { validatePlacement, replayRun } from '../game/run-evaluation';
import {
  validDate,
  validNickname,
  validateStart,
  decodePuzzle,
} from '../shared/response-validation';
import type {
  PuzzleResponse,
  PuzzleProgress,
  PuzzleAvailability,
  RunResponse,
  StartRunRequest,
  CompleteRunRequest,
  SavedResult,
  Scope,
  LeaderboardResponse,
  Placement,
} from '../shared/puzzle-contracts';

type Tx = Prisma.TransactionClient;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? `[${value.map(stable).join(',')}]`
      : `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
          .join(',')}}`
    : JSON.stringify(value);
export class CompetitiveError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string): never => {
  throw new CompetitiveError(status, code, message);
};
const COOKIE = 'puttential_guest';
const cookie = (r: Request) =>
  r.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
export async function currentGuest(request: Request, expected?: unknown): Promise<Guest> {
  const token = cookie(request);
  const guest =
    token && /^[a-f0-9]{64}$/.test(token)
      ? await prisma.guest.findUnique({ where: { sessionHash: hash(token) } })
      : null;
  if (!guest || guest.expiresAt <= new Date())
    return fail(401, 'GUEST_REQUIRED', 'Your guest session expired. Refresh to reconnect.');
  if (expected !== undefined && expected !== guest.id)
    return fail(409, 'GUEST_CHANGED', 'Your guest session changed. Refresh to reconnect.');
  return guest;
}
const player = (g: Guest) => ({ id: g.id, nickname: g.nickname });
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const loopback = (value: string) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        url.port === new URL(request.url).port
      );
    } catch {
      return false;
    }
  };
  const localDevelopment =
    process.env.NODE_ENV !== 'production' && !!origin && loopback(origin) && loopback(request.url);
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== allowed && !localDevelopment)
  )
    fail(403, 'ORIGIN_FORBIDDEN', 'This request must come from the game.');
  if (
    !origin &&
    !['same-origin', 'none'].includes(request.headers.get('sec-fetch-site') ?? '') &&
    process.env.NODE_ENV === 'production'
  )
    fail(403, 'ORIGIN_REQUIRED', 'An origin is required.');
}
export async function createGuest(request: Request) {
  checkOrigin(request);
  try {
    return { player: player(await currentGuest(request)), cookie: null };
  } catch (error) {
    if (!(error instanceof CompetitiveError) || error.status !== 401) throw error;
  }
  // Persisted, replica-wide admission guard. Trusted hosting header is used only on Vercel.
  const bucket = Math.floor(Date.now() / 3600_000);
  const ip = process.env.VERCEL
    ? (request.headers.get('x-vercel-forwarded-for') ?? 'unknown')
    : 'local';
  await prisma.$transaction(async (tx) => {
    const key = `${bucket}:${hash(ip)}`;
    const [rate] = await tx.$queryRaw<
      { count: number }[]
    >`INSERT INTO api_rate_limits (key, count, expires_at) VALUES (${key}, 1, NOW() + interval '2 hours') ON CONFLICT (key) DO UPDATE SET count = api_rate_limits.count + 1 RETURNING count`;
    if (rate!.count > (process.env.VERCEL ? 30 : 1000))
      fail(429, 'RATE_LIMITED', 'Too many new sessions. Please try again later.');
  });
  const token = randomBytes(32).toString('hex');
  const guest = await prisma.guest.create({
    data: {
      sessionHash: hash(token),
      nickname: `Player ${randomBytes(3).toString('hex')}`,
      expiresAt: new Date(Date.now() + 365 * 86400_000),
    },
  });
  const secure =
    new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production';
  return {
    player: player(guest),
    cookie: `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? '; Secure' : ''}`,
  };
}
export async function renameGuest(request: Request, body: any) {
  checkOrigin(request);
  const guest = await currentGuest(request, body.expectedGuestId);
  if (typeof body.nickname !== 'string' || !validNickname(body.nickname))
    fail(400, 'INVALID_NICKNAME', 'Use 3–24 characters without control characters.');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT p.puzzle_id FROM puzzles p WHERE EXISTS (SELECT 1 FROM guest_progress g WHERE g.puzzle_id = p.puzzle_id AND g.guest_id = ${guest.id}) ORDER BY p.puzzle_id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM guests WHERE id = ${guest.id} FOR UPDATE`;
    const fresh = await tx.guest.findUniqueOrThrow({ where: { id: guest.id } });
    if (fresh.nicknameUpdatedAt && Date.now() - fresh.nicknameUpdatedAt.getTime() < 5000)
      fail(429, 'RATE_LIMITED', 'Wait a few seconds before changing your nickname again.');
    const updated = await tx.guest.update({
      where: { id: guest.id },
      data: { nickname: body.nickname.trim(), nicknameUpdatedAt: new Date() },
    });
    await tx.puzzle.updateMany({
      where: { guestProgress: { some: { guestId: guest.id } } },
      data: { boardRevision: { increment: 1 } },
    });
    return { player: player(updated) };
  });
}
export function availability(p: Puzzle): PuzzleAvailability {
  return {
    puzzleId: p.id,
    revision: String(p.availabilityRevision),
    publicationStatus: p.canceledAt ? 'canceled' : 'active',
    canceledAt: p.canceledAt?.toISOString() ?? null,
    cancellationMessage: p.cancellationMessage,
  };
}
export function puzzleResponse(p: Puzzle, now = new Date()): PuzzleResponse {
  if (!p.rules)
    return fail(503, 'COURSE_NOT_PUBLISHED', 'This course has not passed publishing validation.');
  return decodePuzzle({
    id: p.id,
    date: p.date.toISOString().slice(0, 10),
    title: p.title,
    seed: p.seed,
    difficulty: p.difficulty,
    configuration: p.configuration,
    rules: p.rules,
    availability: availability(p),
    serverNow: now.toISOString(),
    todayDate: centralDateString(now),
    nextDailyAt: nextDailyAt(now).toISOString(),
  });
}
async function published(tx: Tx, id: string) {
  const p = await tx.puzzle.findUnique({ where: { id } });
  if (!p || p.date.toISOString().slice(0, 10) > centralDateString())
    return fail(404, 'NOT_FOUND', 'Course not found.');
  return p;
}
export async function datedPuzzle(date: string) {
  if (!validDate(date) || date > centralDateString())
    return fail(404, 'NOT_FOUND', 'Course not found.');
  const p = await prisma.puzzle.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } });
  if (!p) return fail(404, 'NOT_FOUND', 'No course is published for this date.');
  return puzzleResponse(p);
}
function progressDto(g: GuestProgress | null, guestId: string, puzzleId: string): PuzzleProgress {
  return {
    guestId,
    puzzleId,
    revision: String(g?.revision ?? 0),
    attemptsStarted: g?.attemptsStarted ?? 0,
    firstSolveAttempts: g?.firstSolveAttempts ?? null,
    bestDaily: (g?.bestDaily as SavedResult | null) ?? null,
    bestArchive: (g?.bestArchive as SavedResult | null) ?? null,
  };
}
async function runDto(tx: Tx, run: CompetitiveRun): Promise<RunResponse> {
  const p = await published(tx, run.puzzleId);
  const g = await tx.guestProgress.findUnique({
    where: { guestId_puzzleId: { guestId: run.guestId, puzzleId: run.puzzleId } },
  });
  const base = {
    guestId: run.guestId,
    puzzleId: run.puzzleId,
    runId: run.id,
    requestId: run.requestId,
    attemptOrdinal: run.attemptOrdinal,
    startedAt: run.startedAt.toISOString(),
    runRevision: String(run.revision),
    availability: availability(p),
    progress: progressDto(g, run.guestId, run.puzzleId),
  };
  // Historical saved results retain verification after cancellation, with current availability.
  if (run.state === 'saved')
    return {
      ...base,
      state: 'saved',
      completion: run.completion as any,
      result: run.result as SavedResult,
    };
  if (p.canceledAt)
    return {
      ...base,
      state: 'canceled',
      cancellation: {
        code: 'PUZZLE_CANCELED',
        canceledAt: p.canceledAt.toISOString(),
        message: p.cancellationMessage ?? 'Course canceled.',
      },
    };
  if (run.state === 'rejected')
    return {
      ...base,
      state: 'rejected',
      completion: run.completion as any,
      rejection: run.rejection as any,
    };
  if (run.state === 'processing')
    return {
      ...base,
      state: 'processing',
      completion: run.completion as any,
      verification: {
        status:
          run.verificationFailures >= 3 ? 'blocked' : run.leaseToken ? 'running' : 'retry-wait',
        issue: run.verificationFailures
          ? {
              code: 'VERIFICATION_UNAVAILABLE',
              message: 'Verification is delayed. Your result receipt is safe.',
            }
          : null,
      },
      retryAfterMs: 2000,
    };
  return { ...base, state: 'accepted', completion: null };
}
async function lockPuzzle(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT puzzle_id FROM puzzles WHERE puzzle_id = ${id} FOR UPDATE`;
  return published(tx, id);
}
async function databaseNow(tx: Tx) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row!.now;
}
/** Operator-only service; no public mutation route exposes publishing authority. */
export async function cancelPuzzle(date: string, reason: string) {
  if (!validDate(date) || !reason.trim() || reason.length > 240)
    throw new Error('Provide a valid date and a cancellation reason up to 240 characters.');
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      { puzzle_id: string }[]
    >`SELECT puzzle_id FROM puzzles WHERE date = ${new Date(`${date}T00:00:00Z`)}::date FOR UPDATE`;
    if (!row) throw new Error('Course not found');
    const p = await tx.puzzle.findUniqueOrThrow({ where: { id: row.puzzle_id } });
    if (p.canceledAt) return;
    await tx.puzzle.update({
      where: { id: p.id },
      data: {
        canceledAt: await databaseNow(tx),
        cancellationMessage: reason.trim(),
        availabilityRevision: { increment: 1 },
        boardRevision: { increment: 1 },
      },
    });
    await tx.competitiveRun.updateMany({
      where: { puzzleId: p.id, state: { in: ['accepted', 'processing'] } },
      data: { state: 'canceled', leaseToken: null, leaseUntil: null, revision: { increment: 1 } },
    });
  });
}
export async function startRun(guest: Guest, input: StartRunRequest) {
  if (
    !input ||
    typeof input.puzzleId !== 'string' ||
    !input.placement ||
    !Array.isArray(input.placement.commands)
  )
    return fail(400, 'INVALID_SETUP', 'Invalid run setup.');
  const digest = hash(stable(input));
  return prisma.$transaction(
    async (tx) => {
      const p = await lockPuzzle(tx, input.puzzleId);
      const existing = await tx.competitiveRun.findUnique({
        where: { requestId: input.requestId },
      });
      if (existing) {
        if (existing.guestId !== guest.id) return fail(404, 'NOT_FOUND', 'Run not found.');
        if (existing.startHash !== digest)
          return fail(409, 'REQUEST_CONFLICT', 'This request ID already belongs to another setup.');
        return runDto(tx, existing);
      }
      if (p.canceledAt) return fail(410, 'PUZZLE_CANCELED', 'This course was canceled.');
      const course = puzzleResponse(p);
      try {
        validateStart(input, course);
        validatePlacement(course.configuration, input.placement, course.rules);
      } catch (error) {
        return fail(
          400,
          'INVALID_SETUP',
          error instanceof Error ? error.message : 'Invalid setup.',
        );
      }
      await tx.$queryRaw`SELECT id FROM guests WHERE id = ${guest.id} FOR UPDATE`;
      const recent = await tx.competitiveRun.count({
        where: { guestId: guest.id, startedAt: { gt: new Date(Date.now() - 60_000) } },
      });
      if (recent >= 30)
        return fail(429, 'RATE_LIMITED', 'Too many starts. Wait a minute and retry this run.');
      const progress = await tx.guestProgress.upsert({
        where: { guestId_puzzleId: { guestId: guest.id, puzzleId: p.id } },
        create: { guestId: guest.id, puzzleId: p.id, attemptsStarted: 1, revision: 1 },
        update: { attemptsStarted: { increment: 1 }, revision: { increment: 1 } },
      });
      const run = await tx.competitiveRun.create({
        data: {
          guestId: guest.id,
          puzzleId: p.id,
          requestId: input.requestId,
          startHash: digest,
          placement: json(input.placement),
          attemptOrdinal: progress.attemptsStarted,
          startedAt: await databaseNow(tx),
        },
      });
      return runDto(tx, run);
    },
    { timeout: 10000 },
  );
}
export async function readProgress(guest: Guest, puzzleId: string) {
  return prisma.$transaction(async (tx) => {
    const p = await published(tx, puzzleId);
    const g = await tx.guestProgress.findUnique({
      where: { guestId_puzzleId: { guestId: guest.id, puzzleId } },
    });
    return { progress: progressDto(g, guest.id, puzzleId), availability: availability(p) };
  });
}
async function ownedRun(guest: Guest, id: string, byRequest = false) {
  const r = await prisma.competitiveRun.findFirst({
    where: { ...(byRequest ? { requestId: id } : { id }), guestId: guest.id },
  });
  if (!r) return fail(404, 'NOT_FOUND', 'Run not found.');
  return r;
}
export async function readRun(guest: Guest, id: string, byRequest = false) {
  let r = await ownedRun(guest, id, byRequest);
  if (r.state === 'processing') {
    await verifyRun(r.id);
    r = await ownedRun(guest, r.id);
  }
  return prisma.$transaction((tx) => runDto(tx, r));
}
export async function completeRun(guest: Guest, id: string, intent: CompleteRunRequest) {
  const owned = await ownedRun(guest, id);
  if (
    !intent ||
    !['terminal', 'aborted', 'interrupted'].includes(intent.kind) ||
    (intent.kind !== 'terminal' &&
      (!Number.isInteger(intent.observedTick) ||
        intent.observedTick < 0 ||
        intent.observedTick > 7200))
  )
    return fail(400, 'INVALID_COMPLETION', 'Invalid completion intent.');
  await prisma.$transaction(async (tx) => {
    const p = await lockPuzzle(tx, owned.puzzleId);
    const run = await tx.competitiveRun.findUniqueOrThrow({ where: { id } });
    if (p.canceledAt) return;
    if (run.completion) {
      if (stable((run.completion as any).intent) !== stable(intent))
        return fail(409, 'COMPLETION_CONFLICT', 'This run already has a different completion.');
      return;
    }
    // Receipt and qualification are committed before replay; retries never move this timestamp.
    const now = await databaseNow(tx);
    const date = p.date.toISOString().slice(0, 10);
    const eligible =
      intent.kind === 'terminal' &&
      centralDateString(run.startedAt) === date &&
      centralDateString(now) === date;
    await tx.competitiveRun.update({
      where: { id },
      data: {
        state: 'processing',
        completion: json({ intent, receivedAt: now.toISOString(), dailyEligible: eligible }),
        dailyEligible: eligible,
        revision: { increment: 1 },
      },
    });
  });
  await verifyRun(id);
  return readRun(guest, id);
}
function score(result: SavedResult, first: number) {
  const m = result.metrics!;
  return [m.forceCost, m.tileCount, first, m.completionTick, m.pathLengthQ];
}
export function compareScore(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}
export async function verifyRun(id: string) {
  const token = randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    // A database guard bounds admission across replicas, while expiring leases recover crashed workers.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(4822026)`;
    const now = new Date();
    if (
      (await tx.competitiveRun.count({
        where: { state: 'processing', leaseUntil: { gt: now } },
      })) >= 2
    )
      return null;
    const updated = await tx.competitiveRun.updateMany({
      where: {
        id,
        state: 'processing',
        verificationFailures: { lt: 3 },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + 30000) },
    });
    return updated.count
      ? tx.competitiveRun.findUniqueOrThrow({ where: { id }, include: { puzzle: true } })
      : null;
  });
  if (!claimed) return;
  try {
    const intent = (claimed.completion as any).intent as CompleteRunRequest;
    const course = puzzleResponse(claimed.puzzle);
    const evaluated =
      intent.kind === 'terminal'
        ? await replayRun(
            parseLevel(course.configuration),
            claimed.placement as Placement,
            course.rules,
          )
        : null;
    await prisma.$transaction(
      async (tx) => {
        const p = await lockPuzzle(tx, claimed.puzzleId);
        const r = await tx.competitiveRun.findUniqueOrThrow({ where: { id } });
        if (r.leaseToken !== token || r.state !== 'processing') return;
        if (p.canceledAt) {
          await tx.competitiveRun.update({
            where: { id },
            data: { leaseToken: null, leaseUntil: null, revision: { increment: 1 } },
          });
          return;
        }
        const result: SavedResult = {
          runId: id,
          outcome: evaluated?.outcome ?? (intent.kind === 'terminal' ? 'timeout' : intent.kind),
          verification: evaluated ? 'verified' : 'not-applicable',
          metrics: evaluated?.metrics ?? null,
          dailyEligible: r.dailyEligible,
          savedAt: new Date().toISOString(),
        };
        const progress = await tx.guestProgress.findUniqueOrThrow({
          where: { guestId_puzzleId: { guestId: r.guestId, puzzleId: r.puzzleId } },
        });
        const update: Prisma.GuestProgressUpdateInput = { revision: { increment: 1 } };
        if (result.outcome === 'success') {
          const first = progress.firstSolveAttempts ?? r.attemptOrdinal;
          update.firstSolveAttempts = first;
          const better = (old: unknown) =>
            !old || compareScore(score(result, first), score(old as SavedResult, first)) < 0;
          if (better(progress.bestArchive)) update.bestArchive = json(result);
          if (result.dailyEligible && better(progress.bestDaily)) update.bestDaily = json(result);
        }
        await tx.guestProgress.update({
          where: { guestId_puzzleId: { guestId: r.guestId, puzzleId: r.puzzleId } },
          data: update,
        });
        await tx.competitiveRun.update({
          where: { id },
          data: {
            state: 'saved',
            result: json(result),
            leaseToken: null,
            leaseUntil: null,
            revision: { increment: 1 },
          },
        });
        await tx.puzzle.update({ where: { id: p.id }, data: { boardRevision: { increment: 1 } } });
      },
      { timeout: 10000 },
    );
  } catch (error) {
    // An infrastructure failure cannot be represented as a rejected player solution.
    console.error('Run verification delayed', {
      runId: id,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    await prisma.competitiveRun.updateMany({
      where: { id, leaseToken: token, state: 'processing' },
      data: {
        leaseToken: null,
        leaseUntil: null,
        verificationFailures: { increment: 1 },
        revision: { increment: 1 },
      },
    });
  }
}

type Cursor = {
  guest: string;
  puzzle: string;
  scope: string;
  view: string;
  revision: string;
  offset: number;
};
async function cursorSecret() {
  const existing = await prisma.$queryRaw<
    { value: string }[]
  >`SELECT value FROM service_settings WHERE name = 'cursor-signing-key'`;
  if (existing[0]) return existing[0].value;
  await prisma.$executeRaw`INSERT INTO service_settings (name,value) VALUES ('cursor-signing-key',${randomBytes(32).toString('hex')}) ON CONFLICT DO NOTHING`;
  const [created] = await prisma.$queryRaw<
    { value: string }[]
  >`SELECT value FROM service_settings WHERE name = 'cursor-signing-key'`;
  return created!.value;
}
function encodeCursor(c: Cursor, secret: string) {
  const payload = Buffer.from(JSON.stringify(c)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
function decodeCursor(value: string | null, secret: string): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 2000) throw new Error();
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra !== undefined) throw new Error();
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (
      !Number.isSafeInteger(c.offset) ||
      c.offset < 0 ||
      !['guest', 'puzzle', 'scope', 'view', 'revision'].every((k) => typeof c[k] === 'string')
    )
      throw new Error();
    return c;
  } catch {
    return fail(400, 'INVALID_CURSOR', 'Invalid page cursor.');
  }
}
function pageSize(params: URLSearchParams) {
  const limit = Number(params.get('limit') ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    return fail(400, 'INVALID_LIMIT', 'Use a page size between 1 and 50.');
  return limit;
}
export async function leaderboard(
  guest: Guest,
  puzzleId: string,
  params: URLSearchParams,
): Promise<LeaderboardResponse> {
  const secret = await cursorSecret();
  const scope = params.get('scope') ?? 'daily',
    view = params.get('view') ?? 'top',
    limit = pageSize(params),
    cursor = decodeCursor(params.get('cursor'), secret);
  if (!['daily', 'archive'].includes(scope) || !['top', 'around-me'].includes(view))
    return fail(400, 'INVALID_BOARD', 'Invalid leaderboard view.');
  return prisma.$transaction(
    async (tx) => {
      const p = await published(tx, puzzleId),
        revision = String(p.boardRevision);
      if (cursor && cursor.guest !== guest.id)
        return fail(409, 'LEADERBOARD_VIEWER_CHANGED', 'The page belongs to a different guest.');
      if (cursor && (cursor.puzzle !== p.id || cursor.scope !== scope || cursor.view !== view))
        return fail(400, 'INVALID_CURSOR', 'The page belongs to a different board.');
      if (cursor && cursor.revision !== revision)
        return fail(409, 'BOARD_REVISION_CHANGED', 'Standings changed. Refresh to continue.');
      const rows = p.canceledAt
        ? []
        : await tx.guestProgress.findMany({
            where: {
              puzzleId,
              ...(scope === 'daily'
                ? { bestDaily: { not: Prisma.DbNull } }
                : { bestArchive: { not: Prisma.DbNull } }),
            },
            include: { guest: true },
          });
      const values = rows.map((r) => ({
        guest: r.guest,
        first: r.firstSolveAttempts!,
        result: (scope === 'daily' ? r.bestDaily : r.bestArchive) as SavedResult,
      }));
      values.sort(
        (a, b) =>
          compareScore(score(a.result, a.first), score(b.result, b.first)) ||
          a.result.savedAt.localeCompare(b.result.savedAt) ||
          a.guest.id.localeCompare(b.guest.id),
      );
      let rank = 1;
      const ranked = values.map((value, index) => {
        if (
          index &&
          compareScore(
            score(value.result, value.first),
            score(values[index - 1]!.result, values[index - 1]!.first),
          )
        )
          rank = index + 1;
        return {
          rank,
          player: player(value.guest),
          metrics: value.result.metrics!,
          firstSolveAttempts: value.first,
          percentile: 0,
          bestRunId: value.result.runId,
        };
      });
      for (let i = 0; i < ranked.length;) {
        let end = i + 1;
        while (end < ranked.length && ranked[end]!.rank === ranked[i]!.rank) end++;
        for (let j = i; j < end; j++)
          ranked[j]!.percentile = (100 * (ranked.length - end)) / ranked.length;
        i = end;
      }
      const meIndex = ranked.findIndex((r) => r.player.id === guest.id),
        me = ranked[meIndex] ?? null;
      const offset =
        cursor?.offset ??
        (view === 'around-me' && meIndex >= 0 ? Math.max(0, meIndex - Math.floor(limit / 2)) : 0);
      const now = await databaseNow(tx),
        closed = now >= centralMidnight(shiftDate(p.date.toISOString().slice(0, 10), 1));
      const pending =
        p.canceledAt || scope !== 'daily'
          ? 0
          : await tx.competitiveRun.count({
              where: { puzzleId, state: 'processing', dailyEligible: true },
            });
      return {
        viewerGuestId: guest.id,
        puzzleId,
        scope: scope as Scope,
        view: view as 'top' | 'around-me',
        availability: availability(p),
        boardRevision: revision,
        rows: ranked.slice(offset, offset + limit).map(({ bestRunId, ...row }) => row),
        me,
        totalPlayers: ranked.length,
        nextCursor:
          offset + limit < ranked.length
            ? encodeCursor(
                { guest: guest.id, puzzle: p.id, scope, view, revision, offset: offset + limit },
                secret,
              )
            : null,
        asOf: now.toISOString(),
        submissionClosed: scope === 'daily' && closed,
        pendingEligibleCount: pending,
        final: !p.canceledAt && scope === 'daily' && closed && pending === 0,
      };
    },
    // A consistent snapshot without blocking starts and completions on this puzzle.
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export async function archive(guest: Guest, params: URLSearchParams) {
  const secret = await cursorSecret();
  const month = params.get('month'),
    limit = pageSize(params),
    cursor = decodeCursor(params.get('cursor'), secret);
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return fail(400, 'INVALID_MONTH', 'Invalid month.');
  if (
    cursor &&
    (cursor.guest !== guest.id ||
      cursor.view !== (month ?? 'all') ||
      cursor.scope !== 'archive-list')
  )
    return fail(409, 'INVALID_CURSOR', 'Refresh the archive for this guest and month.');
  const start = month ? new Date(`${month}-01T00:00:00Z`) : undefined;
  const end = start
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    : undefined;
  const puzzles = await prisma.puzzle.findMany({
    where: {
      date: {
        lte: new Date(`${centralDateString()}T00:00:00Z`),
        ...(start ? { gte: start } : {}),
        ...(end ? { lt: end } : {}),
      },
      rules: { not: Prisma.DbNull },
    },
    orderBy: { date: 'desc' },
    skip: cursor?.offset ?? 0,
    take: limit + 1,
    include: { guestProgress: { where: { guestId: guest.id } } },
  });
  const items = puzzles.slice(0, limit).map((p) => {
    const g = p.guestProgress[0];
    return {
      id: p.id,
      date: p.date.toISOString().slice(0, 10),
      title: p.title,
      difficulty: p.difficulty,
      status: g?.bestArchive ? 'solved' : g?.attemptsStarted ? 'attempted' : 'unplayed',
      progressRevision: String(g?.revision ?? 0),
      availability: availability(p),
    };
  });
  return {
    guestId: guest.id,
    items,
    nextCursor:
      puzzles.length > limit
        ? encodeCursor(
            {
              guest: guest.id,
              puzzle: '',
              scope: 'archive-list',
              view: month ?? 'all',
              revision: '',
              offset: (cursor?.offset ?? 0) + limit,
            },
            secret,
          )
        : null,
  };
}
