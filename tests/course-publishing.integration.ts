import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { centralDateString, shiftDate } from '../src/backend/puzzle-date';
import { openingCourse } from '../src/backend/daily-courses';
import { decodeArchive, decodePuzzle } from '../src/shared/response-validation';

const connection = process.env.TEST_DATABASE_URL;
if (!connection) throw new Error('Set TEST_DATABASE_URL to a disposable local test database.');
const target = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/test/.test(target.pathname))
  throw new Error('Publishing tests require an explicitly named local test database.');
// Backfill scans the oldest dated course in the entire database. Keep these
// fixtures separate from concurrently running daily tests and the CI schedule.
const database = `course_publishing_test_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(connection);
isolated.pathname = `/${database}`;
process.env.DATABASE_URL = isolated.toString();
const admin = new Client({ connectionString: connection });
let databaseCreated = false;

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  databaseCreated = true;
  execFileSync(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      'migrate',
      'deploy',
      '--config',
      'prisma7.config.ts',
    ],
    { env: process.env, stdio: 'pipe' },
  );
});

after(async () => {
  try {
    if (databaseCreated) {
      const { prisma } = await import('../src/backend/prisma');
      await prisma.$disconnect();
      await admin.query(`DROP DATABASE ${database}`);
    }
  } finally {
    await admin.end();
  }
});

test('unreviewed authored layouts fall back to two verified daily solutions and preserve existing dates', async () => {
  const { prisma } = await import('../src/backend/prisma');
  const { publishSchedule } = await import('../src/backend/course-publishing');
  const today = '2096-12-15';
  const dates = Array.from(
    { length: 10 },
    (_, i) => new Date(`${shiftDate(today, i - 3)}T00:00:00Z`),
  );
  const where = { date: { in: dates } };
  const previousCourseSet = process.env.PUTTENTIAL_COURSE_SET;
  const ids: string[] = [];
  try {
    assert.equal(await prisma.puzzle.count({ where }), 0, 'Test dates must be unused');
    process.env.PUTTENTIAL_COURSE_SET = 'authored';
    const lines = await publishSchedule(today);
    const published = await prisma.puzzle.findMany({ where, orderBy: { date: 'asc' } });
    ids.push(...published.map((puzzle) => puzzle.id));
    assert.equal(published.length, 10);
    assert.equal(lines.filter((line) => line.includes('designer course skipped')).length, 10);
    for (const puzzle of published) {
      const review = puzzle.authorSolution as {
        solutions: unknown[];
        results: { outcome: string }[];
      };
      assert.equal(review.solutions.length, 2);
      assert.notDeepEqual(review.solutions[0], review.solutions[1]);
      assert.equal(review.results.length, 2);
      assert.ok(review.results.every((result) => result.outcome === 'success'));
    }
    await publishSchedule(today);
    assert.deepEqual(
      (await prisma.puzzle.findMany({ where, orderBy: { date: 'asc' } })).map(
        (puzzle) => puzzle.id,
      ),
      ids,
    );
  } finally {
    if (previousCourseSet === undefined) delete process.env.PUTTENTIAL_COURSE_SET;
    else process.env.PUTTENTIAL_COURSE_SET = previousCourseSet;
    await prisma.puzzle.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});

test('maintenance repairs an archive gap longer than three days and preserves courses and progress', async () => {
  const { prisma } = await import('../src/backend/prisma');
  const { backfillSchedule, publishCourse, checkSchedule } =
    await import('../src/backend/course-publishing');
  const { competitiveHandler } = await import('../src/backend/competitive-http');
  const today = shiftDate(centralDateString(), -20);
  const from = shiftDate(today, -15);
  const where = {
    date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${shiftDate(today, 6)}T00:00:00Z`) },
  };
  const previousCourseSet = process.env.PUTTENTIAL_COURSE_SET;
  let guestId: string | undefined;
  let ownsRange = false;
  try {
    assert.equal(await prisma.puzzle.count({ where }), 0, 'Test dates must be unused');
    ownsRange = true;
    process.env.PUTTENTIAL_COURSE_SET = 'opening';
    const course = openingCourse(0);
    await publishCourse(from, course.level, course.rules, course.title, course.solutions);
    const original = await prisma.puzzle.findUniqueOrThrow({
      where: { date: new Date(`${from}T00:00:00Z`) },
    });
    const canceledDate = shiftDate(from, 1);
    await publishCourse(canceledDate, course.level, course.rules, course.title, course.solutions);
    const canceled = await prisma.puzzle.update({
      where: { date: new Date(`${canceledDate}T00:00:00Z`) },
      data: { canceledAt: new Date(), cancellationMessage: 'Retained cancellation' },
    });
    const legacy = await prisma.puzzle.create({
      data: {
        date: new Date(`${shiftDate(from, 2)}T00:00:00Z`),
        seed: 'legacy',
        title: 'Unreviewed legacy course',
        difficulty: 1,
        configuration: original.configuration as any,
      },
    });
    const origin = 'http://127.0.0.1:3000';
    const guest = await competitiveHandler(
      new Request(`${origin}/api/guest`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    assert.equal(guest.status, 200);
    guestId = (await guest.json()).player.id;
    const cookie = guest.headers.get('set-cookie')!.split(';')[0]!;
    const progress = await prisma.guestProgress.create({
      data: { guestId: guestId!, puzzleId: original.id, attemptsStarted: 2 },
    });
    const lines = await backfillSchedule(today);
    assert.match(lines[0]!, new RegExp(`^${today}: published`));
    assert.equal(await prisma.puzzle.count({ where }), 22);
    assert.deepEqual(await prisma.puzzle.findUnique({ where: { id: original.id } }), original);
    assert.deepEqual(await prisma.puzzle.findUnique({ where: { id: canceled.id } }), canceled);
    assert.deepEqual(await prisma.puzzle.findUnique({ where: { id: legacy.id } }), legacy);
    assert.ok(lines.some((line) => line.includes('legacy: not ranked')));
    assert.deepEqual(
      await prisma.guestProgress.findUnique({
        where: { guestId_puzzleId: { guestId: guestId!, puzzleId: original.id } },
      }),
      progress,
    );
    assert.equal((await checkSchedule(today)).length, 7);
    const before = await prisma.puzzle.findMany({ where, orderBy: { date: 'asc' } });
    await backfillSchedule(today);
    assert.deepEqual(await prisma.puzzle.findMany({ where, orderBy: { date: 'asc' } }), before);

    const archive = await competitiveHandler(
      new Request(`${origin}/api/puzzles?limit=50`, {
        headers: { Cookie: cookie },
      }),
    );
    assert.equal(archive.status, 200);
    const dates = new Set(decodeArchive(await archive.json()).items.map((item) => item.date));
    for (const puzzle of before) {
      const date = puzzle.date!.toISOString().slice(0, 10);
      if (!puzzle.rules) {
        assert.ok(!dates.has(date), 'Unreviewed legacy data must remain private');
        continue;
      }
      assert.ok(dates.has(date), `${date} is listed in the archive`);
      const response = await competitiveHandler(
        new Request(`${origin}/api/puzzles/by-date/${date}`),
      );
      assert.equal(response.status, 200);
      assert.equal(decodePuzzle(await response.json()).id, puzzle.id);
    }
  } finally {
    if (previousCourseSet === undefined) delete process.env.PUTTENTIAL_COURSE_SET;
    else process.env.PUTTENTIAL_COURSE_SET = previousCourseSet;
    if (guestId) {
      await prisma.guestProgress.deleteMany({ where: { guestId } });
      await prisma.guest.delete({ where: { id: guestId } });
    }
    if (ownsRange) await prisma.puzzle.deleteMany({ where });
    await prisma.$disconnect();
  }
});
