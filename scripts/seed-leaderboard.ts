import 'dotenv/config';

import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { prisma } from '../src/backend/prisma';
import { parseLevel } from '../src/game';
import { replayRun } from '../src/game/run-evaluation';
import { validDate } from '../src/shared/response-validation';
import type { Placement, PuzzleRules, SavedResult } from '../src/shared/puzzle-contracts';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const names = [
  'Birdie Hunter',
  'Green Reader',
  'Flag Seeker',
  'Quiet Putter',
  'Backspin',
  'Cup Chaser',
  'Fairway Friend',
  'Lucky Bounce',
  'Pin High',
  'Long Putt',
  'Soft Touch',
  'Break Reader',
] as const;

function requireLocalDatabase() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Leaderboard fixtures are disabled in production.');
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error('DATABASE_URL is not defined.');
  const hostname = new URL(connection).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname))
    throw new Error('Leaderboard fixtures may only be written to a local database.');
}

async function main() {
  requireLocalDatabase();
  const date = process.argv[2] ?? '2026-11-16';
  const count = Number(process.argv[3] ?? 12);
  if (!validDate(date)) throw new Error('Usage: npm run leaderboard:seed -- YYYY-MM-DD [count]');
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new Error('Fixture count must be an integer from 1 through 50.');

  const puzzle = await prisma.puzzle.findUnique({
    where: { date: new Date(`${date}T00:00:00Z`) },
  });
  if (!puzzle?.rules || !puzzle.authorSolution)
    throw new Error(`${date} must be a published daily course with reviewed solutions.`);

  const review = puzzle.authorSolution as { solutions?: unknown };
  if (!Array.isArray(review.solutions) || review.solutions.length === 0)
    throw new Error(`${date} does not have reviewed solutions available for fixtures.`);
  const placements = review.solutions as Placement[];
  const level = parseLevel(puzzle.configuration);
  const rules = puzzle.rules as PuzzleRules;
  const evaluations = await Promise.all(
    placements.map(async (placement) => ({
      placement,
      evaluation: await replayRun(level, placement, rules),
    })),
  );
  if (evaluations.some(({ evaluation }) => evaluation.outcome !== 'success'))
    throw new Error(`${date} has a reviewed solution that no longer succeeds.`);

  const prefix = `leaderboard-fixture-${date}-`;
  await prisma.$transaction(async (tx) => {
    const previous = await tx.guest.findMany({
      where: { id: { startsWith: prefix } },
      select: { id: true },
    });
    const previousIds = previous.map(({ id }) => id);
    if (previousIds.length) {
      await tx.competitiveRun.deleteMany({ where: { guestId: { in: previousIds } } });
      await tx.guestProgress.deleteMany({ where: { guestId: { in: previousIds } } });
      await tx.guest.deleteMany({ where: { id: { in: previousIds } } });
    }

    for (let index = 0; index < count; index++) {
      const number = index + 1;
      const guestId = `${prefix}${String(number).padStart(2, '0')}`;
      const runId = `${guestId}-run`;
      const { placement, evaluation } = evaluations[index % evaluations.length]!;
      const savedAt = new Date(Date.parse(`${date}T18:00:00Z`) + index * 60_000).toISOString();
      const result: SavedResult = {
        runId,
        outcome: 'success',
        verification: 'verified',
        metrics: evaluation.metrics,
        dailyEligible: true,
        savedAt,
      };
      const completion = {
        intent: { expectedGuestId: guestId, kind: 'terminal' as const },
        receivedAt: savedAt,
        dailyEligible: true,
      };
      await tx.guest.create({
        data: {
          id: guestId,
          sessionHash: hash(`${guestId}-session`),
          nickname: names[index % names.length]!,
          expiresAt: new Date('2100-01-01T00:00:00Z'),
        },
      });
      await tx.competitiveRun.create({
        data: {
          id: runId,
          requestId: `${guestId}-request`,
          guestId,
          puzzleId: puzzle.id,
          startHash: hash(JSON.stringify(placement)),
          placement: json(placement),
          attemptOrdinal: number,
          startedAt: new Date(savedAt),
          revision: 3,
          state: 'saved',
          completion: json(completion),
          result: json(result),
          dailyEligible: true,
        },
      });
      await tx.guestProgress.create({
        data: {
          guestId,
          puzzleId: puzzle.id,
          revision: 1,
          attemptsStarted: number,
          firstSolveAttempts: number,
          bestDaily: json(result),
          bestArchive: json(result),
        },
      });
    }
    await tx.puzzle.update({
      where: { id: puzzle.id },
      data: { boardRevision: { increment: 1 } },
    });
  });

  console.log(
    `${date}: seeded ${count} local leaderboard fixtures. Re-running replaces fixtures for this date.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Leaderboard fixture seed failed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
