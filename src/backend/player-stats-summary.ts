import { shiftDate } from './puzzle-date';
import type { PlayerDay, PlayerStats } from '../shared/puzzle-contracts';

/** One dated course as the statistics see it. Canceled courses are kept so streaks can skip them. */
export type DayRecord = PlayerDay & { canceled: boolean };

const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: number[]) =>
  values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

/** A "top N%" finish: within the first N% of ranks, and always true for rank 1. */
const withinTop = (rank: number, players: number, share: number) =>
  rank <= Math.max(1, Math.ceil(players * share));

/**
 * Pure summary of a player's history, so it can be unit-tested without a database.
 *
 * Streak rule: a day counts when the player solved that course during its original daily
 * window (a daily-eligible verified success). Canceled courses neither count nor break a
 * streak. A date with no published course breaks it. Today's course is still open, so an
 * unsolved today does not break the current streak yet.
 */
export function summarize(days: DayRecord[], today: string): PlayerStats {
  const live = days.filter((d) => !d.canceled);
  const played = live.filter((d) => d.attemptsStarted > 0);
  const solved = live.filter((d) => d.firstSolveAttempts !== null);
  const ranked = live.filter(
    (d) => d.solvedOnDay && d.dailyRank !== null && d.dailyPlayers !== null,
  );
  const byDate = new Map(days.map((d) => [d.date, d]));

  const streakEndingAt = (start: string) => {
    let length = 0;
    for (let date = start; ; date = shiftDate(date, -1)) {
      const day = byDate.get(date);
      if (!day) return length;
      if (day.canceled) continue;
      if (!day.solvedOnDay) return length;
      length++;
    }
  };
  const currentStreak = byDate.get(today)?.solvedOnDay
    ? streakEndingAt(today)
    : streakEndingAt(shiftDate(today, -1));

  let bestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (previous !== null && day.date !== shiftDate(previous, 1)) run = 0;
    previous = day.date;
    if (day.canceled) continue;
    run = day.solvedOnDay ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  return {
    gamesPlayed: played.length,
    gamesSolved: solved.length,
    dailySolves: ranked.length,
    currentStreak,
    bestStreak,
    averagePercentile: mean(ranked.map((d) => d.dailyPercentile!)),
    bestFinish: ranked.length ? Math.min(...ranked.map((d) => d.dailyRank!)) : null,
    top10Finishes: ranked.filter((d) => withinTop(d.dailyRank!, d.dailyPlayers!, 0.1)).length,
    top1Finishes: ranked.filter((d) => withinTop(d.dailyRank!, d.dailyPlayers!, 0.01)).length,
    averageAttempts: mean(solved.map((d) => d.firstSolveAttempts!)),
    averageTiles: mean(solved.flatMap((d) => (d.best ? [d.best.tileCount] : []))),
  };
}
