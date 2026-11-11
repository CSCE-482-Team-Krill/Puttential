import { Prisma } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { compareScore, score } from './competitive';
import type { SavedResult, StandingFields } from '../shared/puzzle-contracts';

type Standing = { rank: number | null; players: number | null; percentile: number | null };
const NO_STANDING: Standing = { rank: null, players: null, percentile: null };

/** This guest's progress on one course (undefined when never played). */
export type OwnProgress =
  { firstSolveAttempts: number | null; bestDaily: unknown; bestArchive: unknown } | undefined;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Rank, board size and percentile with the leaderboard's score order and tie rule. */
function standing(board: number[][] | undefined, mine: number[] | null): Standing {
  if (!board?.length || !mine) return NO_STANDING;
  const better = board.filter((other) => compareScore(other, mine) < 0).length;
  const worse = board.filter((other) => compareScore(other, mine) > 0).length;
  return {
    rank: better + 1,
    players: board.length,
    percentile: round1((100 * worse) / board.length),
  };
}

const fields = (daily: Standing, archive: Standing): StandingFields => ({
  dailyRank: daily.rank,
  dailyPlayers: daily.players,
  dailyPercentile: daily.percentile,
  archiveRank: archive.rank,
  archivePlayers: archive.players,
  archivePercentile: archive.percentile,
});
export const NO_STANDINGS = fields(NO_STANDING, NO_STANDING);

/**
 * The guest's daily-board and archive-board standing on each given course, in one query.
 * The daily board holds results verified on the course's own Central day; the archive
 * board holds every verified success, including late plays. Courses the guest never
 * solved (and canceled courses, which the caller leaves out) get null standings.
 */
export async function loadStandings(
  courses: { puzzleId: string; progress: OwnProgress }[],
): Promise<Map<string, StandingFields>> {
  const result = new Map<string, StandingFields>();
  // Every daily solve is also on the archive board, so "solved at all" covers both boards.
  const solved = courses.filter((c) => c.progress?.bestArchive);
  if (!solved.length) return result;

  const rows = await prisma.guestProgress.findMany({
    where: {
      puzzleId: { in: solved.map((c) => c.puzzleId) },
      bestArchive: { not: Prisma.DbNull },
    },
    select: { puzzleId: true, firstSolveAttempts: true, bestDaily: true, bestArchive: true },
  });
  const dailyBoards = new Map<string, number[][]>();
  const archiveBoards = new Map<string, number[][]>();
  const add = (boards: Map<string, number[][]>, puzzleId: string, value: number[]) =>
    boards.set(puzzleId, [...(boards.get(puzzleId) ?? []), value]);
  for (const row of rows) {
    const first = row.firstSolveAttempts!;
    add(archiveBoards, row.puzzleId, score(row.bestArchive as SavedResult, first));
    if (row.bestDaily) add(dailyBoards, row.puzzleId, score(row.bestDaily as SavedResult, first));
  }

  for (const { puzzleId, progress } of solved) {
    const first = progress!.firstSolveAttempts;
    const daily = (progress!.bestDaily as SavedResult | null) ?? null;
    const archive = progress!.bestArchive as SavedResult;
    result.set(
      puzzleId,
      fields(
        standing(dailyBoards.get(puzzleId), daily && first !== null ? score(daily, first) : null),
        standing(archiveBoards.get(puzzleId), first !== null ? score(archive, first) : null),
      ),
    );
  }
  return result;
}
