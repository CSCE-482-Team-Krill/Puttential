import { Prisma } from '../../generated/prisma/client';
import type { Guest } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { compareScore, score } from './competitive';
import { centralDateString, shiftDate } from './puzzle-date';
import { summarize, type DayRecord } from './player-stats-summary';
import type { PlayerStatsResponse, SavedResult } from '../shared/puzzle-contracts';

/** How many calendar days of history the profile receives, newest first. */
export const STATS_HISTORY_DAYS = 366;

const round1 = (value: number) => Math.round(value * 10) / 10;

type Standing = { rank: number | null; players: number | null; percentile: number | null };
const NO_STANDING: Standing = { rank: null, players: null, percentile: null };

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

/** GET /api/me/stats: profile statistics and per-day history for the current guest. */
export async function readPlayerStats(guest: Guest): Promise<PlayerStatsResponse> {
  const today = centralDateString();
  const puzzles = await prisma.puzzle.findMany({
    where: {
      date: {
        lte: new Date(`${today}T00:00:00Z`),
        gte: new Date(`${shiftDate(today, -(STATS_HISTORY_DAYS - 1))}T00:00:00Z`),
      },
      rules: { not: Prisma.DbNull },
    },
    orderBy: { date: 'desc' },
    include: { guestProgress: { where: { guestId: guest.id } } },
  });

  // Every daily solve is also on the archive board, so "solved at all" covers both boards.
  // Load both boards of those courses in one query.
  const solvedIds = puzzles
    .filter((p) => !p.canceledAt && p.guestProgress[0]?.bestArchive)
    .map((p) => p.id);
  const boardRows = solvedIds.length
    ? await prisma.guestProgress.findMany({
        where: { puzzleId: { in: solvedIds }, bestArchive: { not: Prisma.DbNull } },
        select: { puzzleId: true, firstSolveAttempts: true, bestDaily: true, bestArchive: true },
      })
    : [];
  const dailyBoards = new Map<string, number[][]>();
  const archiveBoards = new Map<string, number[][]>();
  const add = (boards: Map<string, number[][]>, puzzleId: string, value: number[]) =>
    boards.set(puzzleId, [...(boards.get(puzzleId) ?? []), value]);
  for (const row of boardRows) {
    const first = row.firstSolveAttempts!;
    add(archiveBoards, row.puzzleId, score(row.bestArchive as SavedResult, first));
    if (row.bestDaily) add(dailyBoards, row.puzzleId, score(row.bestDaily as SavedResult, first));
  }

  const days = puzzles.map((p): DayRecord => {
    const progress = p.guestProgress[0];
    const first = progress?.firstSolveAttempts ?? null;
    const daily = (progress?.bestDaily as SavedResult | null | undefined) ?? null;
    const archive = (progress?.bestArchive as SavedResult | null | undefined) ?? null;
    const onDay = standing(
      dailyBoards.get(p.id),
      daily && first !== null ? score(daily, first) : null,
    );
    const allTime = standing(
      archiveBoards.get(p.id),
      archive && first !== null ? score(archive, first) : null,
    );
    return {
      puzzleId: p.id,
      date: p.date.toISOString().slice(0, 10),
      title: p.title,
      status: archive ? 'solved' : progress?.attemptsStarted ? 'attempted' : 'unplayed',
      attemptsStarted: progress?.attemptsStarted ?? 0,
      firstSolveAttempts: first,
      solvedOnDay: !!daily,
      // The archive best covers every verified success, including the original day.
      best: archive?.metrics ?? null,
      dailyRank: onDay.rank,
      dailyPlayers: onDay.players,
      dailyPercentile: onDay.percentile,
      archiveRank: allTime.rank,
      archivePlayers: allTime.players,
      archivePercentile: allTime.percentile,
      canceled: !!p.canceledAt,
    };
  });

  return {
    guestId: guest.id,
    today,
    asOf: new Date().toISOString(),
    stats: summarize(days, today),
    days: days.map(({ canceled: _canceled, ...day }) => day),
  };
}
