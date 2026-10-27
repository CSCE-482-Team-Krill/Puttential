import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { openingCourse } from './daily-courses';
import { centralDateString, shiftDate } from './puzzle-date';
import { replayRun, defaultRules } from '../game/run-evaluation';
import { parseLevel, createGame } from '../game';
import { validDate, decodePuzzle } from '../shared/response-validation';
import { puzzleResponse } from './competitive';
import type { Placement, PuzzleRules } from '../shared/puzzle-contracts';

const json = (value: unknown) => value as Prisma.InputJsonValue;
async function publish(
  date: string,
  level: ReturnType<typeof parseLevel>,
  rules: PuzzleRules,
  title: string,
  solutions: Placement[],
) {
  if (
    !validDate(date) ||
    !title.trim() ||
    solutions.length < 2 ||
    JSON.stringify(solutions[0]) === JSON.stringify(solutions[1])
  )
    throw new Error('Publishing requires a date, title and two distinct solutions.');
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
  const existing = await prisma.puzzle.findUnique({
    where: { date: new Date(`${date}T00:00:00Z`) },
  });
  if (existing) {
    console.log(
      `${date}: preserved existing course ${existing.id}${existing.rules ? '' : ' (legacy: not ranked until explicitly republished)'}`,
    );
    return;
  }
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
  console.log(
    `${date}: published ${title}; two verified solutions (${Math.round(replayMs)}ms total); full-cap replay ${Math.round(fullRunMs)}ms`,
  );
}
async function main() {
  const [command = 'schedule', file, dateArg] = process.argv.slice(2);
  if (command === 'schedule') {
    const today = centralDateString();
    for (let offset = -3; offset <= 6; offset++) {
      const course = openingCourse(offset + 3);
      await publish(
        shiftDate(today, offset),
        course.level,
        course.rules,
        course.title,
        course.solutions,
      );
    }
  } else if (command === 'course') {
    if (!file || !dateArg)
      throw new Error('Usage: npm run courses:publish -- course reviewed-course.json YYYY-MM-DD');
    const spec = JSON.parse(await readFile(file, 'utf8'));
    const level = parseLevel(spec.configuration);
    await publish(dateArg, level, spec.rules ?? defaultRules(level), spec.title, spec.solutions);
  } else if (command === 'check') {
    const today = centralDateString();
    for (let offset = 0; offset <= 6; offset++) {
      const date = shiftDate(today, offset),
        p = await prisma.puzzle.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } });
      if (!p || !p.rules || p.canceledAt)
        throw new Error(`Missing or canceled reviewed course: ${date}`);
      // Validate future courses without exposing them through public HTTP.
      decodePuzzle({ ...puzzleResponse(p, new Date(`${date}T18:00:00Z`)) });
      console.log(`${date}: ready (${p.title})`);
    }
  } else if (command === 'recover') {
    await prisma.competitiveRun.updateMany({
      where: {
        state: 'processing',
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { verificationFailures: 0 },
    });
    const { verifyRun } = await import('./competitive');
    for (const r of await prisma.competitiveRun.findMany({
      where: { state: 'processing' },
      take: 100,
      orderBy: { startedAt: 'asc' },
    }))
      await verifyRun(r.id);
    await prisma.$executeRaw`DELETE FROM api_rate_limits WHERE expires_at < NOW()`;
    console.log('Recovered queued verification and expired admission records.');
  } else if (command === 'cancel') {
    if (!file || !dateArg?.trim())
      throw new Error('Usage: npm run courses:publish -- cancel YYYY-MM-DD "Reason"');
    const { cancelPuzzle } = await import('./competitive');
    await cancelPuzzle(file, dateArg);
    console.log(`${file}: canceled; historical verification retained and ranking removed.`);
  } else throw new Error('Commands: schedule, course, check, recover, cancel');
}
main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'Publishing failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
