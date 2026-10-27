import { performance } from 'node:perf_hooks';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { openingCourse } from './daily-courses';
import { centralDateString, shiftDate } from './puzzle-date';
import { replayRun } from '../game/run-evaluation';
import { parseLevel, createGame } from '../game';
import { validDate, decodePuzzle } from '../shared/response-validation';
import { puzzleResponse, verifyRun } from './competitive';
import type { Placement, PuzzleRules } from '../shared/puzzle-contracts';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const OPENING_COURSES = 10;

/** The same date always gets the same opening course, whichever day the schedule runs. */
export function openingIndexForDate(date: string): number {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return ((day % OPENING_COURSES) + OPENING_COURSES) % OPENING_COURSES;
}

/** Validates and inserts one dated course. Existing dates are never overwritten. */
export async function publishCourse(
  date: string,
  level: ReturnType<typeof parseLevel>,
  rules: PuzzleRules,
  title: string,
  solutions: Placement[],
): Promise<string> {
  if (
    !validDate(date) ||
    !title.trim() ||
    solutions.length < 2 ||
    JSON.stringify(solutions[0]) === JSON.stringify(solutions[1])
  )
    throw new Error('Publishing requires a date, title and two distinct solutions.');

  const existing = await prisma.puzzle.findUnique({
    where: { date: new Date(`${date}T00:00:00Z`) },
  });
  if (existing)
    return `${date}: preserved existing course ${existing.id}${existing.rules ? '' : ' (legacy: not ranked until explicitly republished)'}`;

  if (
    level.dynamicBodies.length > 32 ||
    level.staticBodies.length > 128 ||
    level.fields.length > 256 ||
    JSON.stringify(level).length > 128 * 1024
  )
    throw new Error('Course exceeds the supported replay budget.');
  decodePuzzle({
    id: 'publishing-validation',
    date,
    todayDate: date,
    title,
    seed: `reviewed-${date}`,
    difficulty: 1,
    configuration: level,
    rules,
    availability: {
      puzzleId: 'publishing-validation',
      revision: '0',
      publicationStatus: 'active',
      canceledAt: null,
      cancellationMessage: null,
    },
    serverNow: `${date}T12:00:00Z`,
    nextDailyAt: `${shiftDate(date, 1)}T06:00:00Z`,
  });

  const started = performance.now();
  const results = [];
  for (const placement of solutions) {
    const result = await replayRun(level, placement, rules);
    if (result.outcome !== 'success')
      throw new Error(`Review solution failed: ${date} (${result.outcome})`);
    results.push(result);
  }
  const replayMs = performance.now() - started;
  if (replayMs > 5000)
    throw new Error('Reviewed replays exceed the five-second publishing budget.');

  const benchmarkStart = performance.now(),
    benchmark = await createGame(level);
  try {
    benchmark.applySetup(
      solutions[0]!.commands.map((c) =>
        c.type === 'set-field-enabled' ? { ...c, enabled: true } : c,
      ),
    );
    for (let tick = 0; tick < rules.maxTicks; tick++) benchmark.step();
  } finally {
    benchmark.destroy();
  }
  const fullRunMs = performance.now() - benchmarkStart;
  if (fullRunMs > 3000)
    throw new Error('Full-cap replay exceeds the three-second publishing budget.');

  try {
    await prisma.puzzle.create({
      data: {
        date: new Date(`${date}T00:00:00Z`),
        title,
        seed: `reviewed-${date}`,
        difficulty: 1,
        configuration: json(level),
        rules: json(rules),
        authorSolution: json({
          solutions,
          results,
          replayMs: Math.round(replayMs),
          fullRunMs: Math.round(fullRunMs),
          reviewedAt: new Date().toISOString(),
        }),
      },
    });
  } catch (error) {
    // Two runs at the same time (for example a duplicate cron delivery): the other one won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return `${date}: preserved course published concurrently`;
    throw error;
  }
  return `${date}: published ${title}; two verified solutions (${Math.round(replayMs)}ms total); full-cap replay ${Math.round(fullRunMs)}ms`;
}

/** Publishes the opening rotation for three past days, today and the next six days. */
export async function publishSchedule(today = centralDateString()): Promise<string[]> {
  const lines: string[] = [];
  for (let offset = -3; offset <= 6; offset++) {
    const date = shiftDate(today, offset);
    const course = openingCourse(openingIndexForDate(date));
    lines.push(
      await publishCourse(date, course.level, course.rules, course.title, course.solutions),
    );
  }
  return lines;
}

/** Throws if today or any of the next six days has no reviewed, active course. */
export async function checkSchedule(today = centralDateString()): Promise<string[]> {
  const lines: string[] = [];
  for (let offset = 0; offset <= 6; offset++) {
    const date = shiftDate(today, offset),
      p = await prisma.puzzle.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } });
    if (!p || !p.rules || p.canceledAt)
      throw new Error(`Missing or canceled reviewed course: ${date}`);
    // Validate future courses without exposing them through public HTTP.
    decodePuzzle({ ...puzzleResponse(p, new Date(`${date}T18:00:00Z`)) });
    lines.push(`${date}: ready (${p.title})`);
  }
  return lines;
}

/** Retries queued verifications (up to 100) and removes expired guest-admission counters. */
export async function recoverRuns(): Promise<string> {
  await prisma.competitiveRun.updateMany({
    where: {
      state: 'processing',
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { verificationFailures: 0 },
  });
  const queued = await prisma.competitiveRun.findMany({
    where: { state: 'processing' },
    take: 100,
    orderBy: { startedAt: 'asc' },
  });
  for (const r of queued) await verifyRun(r.id);
  await prisma.$executeRaw`DELETE FROM api_rate_limits WHERE expires_at < NOW()`;
  return `Retried ${queued.length} queued verification(s) and removed expired admission records.`;
}
