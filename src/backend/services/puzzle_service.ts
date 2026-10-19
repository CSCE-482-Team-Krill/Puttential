import { prisma } from '../prisma';
import type { TodayPuzzleResponse } from '../types';

import { centralDateString } from '../puzzle-date';
import { parseLevel } from '../../game/levels/parse';

/**
 * Converts a YYYY-MM-DD string into the Date representation used by
 * Prisma for our PostgreSQL DATE column.
 */
function databaseDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

/**
 * Finds the canonical puzzle for a specific calendar date.
 *
 * The service returns a backend/API DTO instead of exposing
 * the raw Prisma database record directly.
 */
export async function getPuzzleByDate(date: Date): Promise<TodayPuzzleResponse | null> {
  const centralDate = centralDateString(date);

  const puzzle = await prisma.puzzle.findUnique({
    where: {
      date: databaseDate(centralDate),
    },
    // Only select fields that the frontend needs for the daily puzzle.
    select: {
      id: true,
      date: true,
      seed: true,
      difficulty: true,
      configuration: true,
    },
  });

  if (!puzzle) {
    return null;
  }

  // Convert the Prisma/database object into our API response format.
  return {
    id: puzzle.id,
    date: centralDate,
    seed: puzzle.seed,
    difficulty: puzzle.difficulty,
    configuration: parseLevel(puzzle.configuration),
  };
}

/**
 * Returns today's puzzle according to U.S. Central Time.
 *
 * This will eventually be used by:
 *
 * GET /api/puzzles/today
 *
 * Route Handler.
 */
export async function getTodaysPuzzle(): Promise<TodayPuzzleResponse | null> {
  return getPuzzleByDate(new Date());
}
