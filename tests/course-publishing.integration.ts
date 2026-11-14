import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftDate } from '../src/backend/puzzle-date';

const connection = process.env.TEST_DATABASE_URL;
if (!connection) throw new Error('Set TEST_DATABASE_URL to a disposable local test database.');
const target = new URL(connection);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/test/.test(target.pathname))
  throw new Error('Publishing tests require an explicitly named local test database.');
process.env.DATABASE_URL = connection;

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
