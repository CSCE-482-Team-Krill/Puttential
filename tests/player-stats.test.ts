import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarize, type DayRecord } from '../src/backend/player-stats-summary';

/** A dated course for the summary. By default: played and solved on its day, rank 1 of 1. */
function day(date: string, overrides: Partial<DayRecord> = {}): DayRecord {
  return {
    puzzleId: `puzzle-${date}`,
    date,
    title: `Course ${date}`,
    status: 'solved',
    attemptsStarted: 2,
    firstSolveAttempts: 2,
    solvedOnDay: true,
    best: { forceCost: 3, tileCount: 2, completionTick: 300, pathLengthQ: 9000 },
    dailyRank: 1,
    dailyPlayers: 1,
    dailyPercentile: 0,
    archiveRank: 1,
    archivePlayers: 1,
    archivePercentile: 0,
    canceled: false,
    ...overrides,
  };
}
const unplayed = (date: string) =>
  day(date, {
    status: 'unplayed',
    attemptsStarted: 0,
    firstSolveAttempts: null,
    solvedOnDay: false,
    best: null,
    dailyRank: null,
    dailyPlayers: null,
    dailyPercentile: null,
    archiveRank: null,
    archivePlayers: null,
    archivePercentile: null,
  });

test('a new player has empty statistics', () => {
  const stats = summarize([unplayed('2026-11-10'), unplayed('2026-11-09')], '2026-11-10');
  assert.deepEqual(stats, {
    gamesPlayed: 0,
    gamesSolved: 0,
    dailySolves: 0,
    currentStreak: 0,
    bestStreak: 0,
    averagePercentile: null,
    bestFinish: null,
    top10Finishes: 0,
    top1Finishes: 0,
    averageAttempts: null,
    averageTiles: null,
  });
});

test('an unsolved today keeps yesterday’s streak alive until the day ends', () => {
  const days = [unplayed('2026-11-10'), day('2026-11-09'), day('2026-11-08')];
  assert.equal(summarize(days, '2026-11-10').currentStreak, 2);
  // Solving today extends it.
  assert.equal(summarize([day('2026-11-10'), ...days.slice(1)], '2026-11-10').currentStreak, 3);
});

test('a missed day breaks the current streak but not the best streak', () => {
  const days = [
    day('2026-11-10'),
    unplayed('2026-11-09'),
    day('2026-11-08'),
    day('2026-11-07'),
    day('2026-11-06'),
  ];
  const stats = summarize(days, '2026-11-10');
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.bestStreak, 3);
});

test('archive solves count as solved games but not as streak days', () => {
  const lateSolve = day('2026-11-09', {
    solvedOnDay: false,
    dailyRank: null,
    dailyPlayers: null,
    dailyPercentile: null,
  });
  const stats = summarize([day('2026-11-10'), lateSolve, day('2026-11-08')], '2026-11-10');
  assert.equal(stats.gamesSolved, 3);
  assert.equal(stats.dailySolves, 2);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.bestStreak, 1);
});

test('canceled courses neither count nor break a streak', () => {
  const days = [day('2026-11-10'), unplayed('2026-11-09'), day('2026-11-08')];
  days[1]!.canceled = true;
  const stats = summarize(days, '2026-11-10');
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.gamesPlayed, 2);
});

test('a date with no published course breaks the streak', () => {
  const stats = summarize([day('2026-11-10'), day('2026-11-08')], '2026-11-10');
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.bestStreak, 1);
});

test('finishes, percentile, attempts and tiles are averaged over the right days', () => {
  const days = [
    day('2026-11-10', {
      dailyRank: 1,
      dailyPlayers: 40,
      dailyPercentile: 97.5,
      firstSolveAttempts: 1,
    }),
    day('2026-11-09', {
      dailyRank: 5,
      dailyPlayers: 40,
      dailyPercentile: 87.5,
      firstSolveAttempts: 4,
    }),
    day('2026-11-08', {
      dailyRank: 30,
      dailyPlayers: 40,
      dailyPercentile: 25,
      firstSolveAttempts: 7,
      best: { forceCost: 6, tileCount: 5, completionTick: 900, pathLengthQ: 20000 },
    }),
    day('2026-11-07', {
      status: 'attempted',
      firstSolveAttempts: null,
      solvedOnDay: false,
      best: null,
      dailyRank: null,
      dailyPlayers: null,
      dailyPercentile: null,
    }),
  ];
  const stats = summarize(days, '2026-11-10');
  assert.equal(stats.gamesPlayed, 4);
  assert.equal(stats.gamesSolved, 3);
  assert.equal(stats.bestFinish, 1);
  assert.equal(stats.averagePercentile, 70);
  // Top 10% of 40 players = ranks 1–4; top 1% = rank 1 only.
  assert.equal(stats.top10Finishes, 1);
  assert.equal(stats.top1Finishes, 1);
  assert.equal(stats.averageAttempts, 4);
  assert.equal(stats.averageTiles, 3);
});

test('rank 1 is always a top 1% finish, even on a small board', () => {
  const stats = summarize([day('2026-11-10', { dailyRank: 1, dailyPlayers: 3 })], '2026-11-10');
  assert.equal(stats.top1Finishes, 1);
  assert.equal(stats.top10Finishes, 1);
});
