import { Prisma } from '../../generated/prisma/client';
import type { Guest } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { centralDateString, shiftDate } from './puzzle-date';
import { summarize, type DayRecord } from './player-stats-summary';
import { loadStandings, NO_STANDINGS } from './standings';
import type { PlayerStatsResponse, SavedResult } from '../shared/puzzle-contracts';

/** How many calendar days of history the profile receives, newest first. */
export const STATS_HISTORY_DAYS = 366;

/** GET /api/me/stats: profile statistics and per-day history for the current guest. */
export async function readPlayerStats(guest: Guest): Promise<PlayerStatsResponse> {
  const today = centralDateString();
  const puzzles = await prisma.puzzle.findMany({
    where: {
      communityMapId: null,
      date: {
        lte: new Date(`${today}T00:00:00Z`),
        gte: new Date(`${shiftDate(today, -(STATS_HISTORY_DAYS - 1))}T00:00:00Z`),
      },
      rules: { not: Prisma.DbNull },
    },
    orderBy: { date: 'desc' },
    include: { guestProgress: { where: { guestId: guest.id } } },
  });
  const standings = await loadStandings(
    puzzles
      .filter((p) => !p.canceledAt)
      .map((p) => ({ puzzleId: p.id, progress: p.guestProgress[0] })),
  );

  const days = puzzles.map((p): DayRecord => {
    const progress = p.guestProgress[0];
    const daily = (progress?.bestDaily as SavedResult | null | undefined) ?? null;
    const archive = (progress?.bestArchive as SavedResult | null | undefined) ?? null;
    return {
      puzzleId: p.id,
      date: p.date!.toISOString().slice(0, 10),
      title: p.title,
      status: archive ? 'solved' : progress?.attemptsStarted ? 'attempted' : 'unplayed',
      attemptsStarted: progress?.attemptsStarted ?? 0,
      firstSolveAttempts: progress?.firstSolveAttempts ?? null,
      solvedOnDay: !!daily,
      // The archive best covers every verified success, including the original day.
      best: archive?.metrics ?? null,
      ...(standings.get(p.id) ?? NO_STANDINGS),
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
