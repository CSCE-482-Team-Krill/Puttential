import type { Level } from '../game';
import type { PuzzleResponse } from '../shared/puzzle-contracts';
export type CourseContext =
  | { key: string; source: 'daily' | 'archive'; level: Level; puzzle: PuzzleResponse }
  | { key: string; source: 'practice' | 'local' | 'bonus'; level: Level; puzzle?: never };
export const publishedContext = (p: PuzzleResponse): CourseContext => ({
  key: JSON.stringify([
    p.id,
    p.configuration.id,
    p.configuration.version,
    p.rules.rulesVersion,
    p.rules.simulationVersion,
  ]),
  source: p.date === p.todayDate ? 'daily' : 'archive',
  level: p.configuration,
  puzzle: p,
});
export const localContext = (
  level: Level,
  source: 'practice' | 'local' | 'bonus' = 'practice',
): CourseContext => ({
  key: JSON.stringify(['local-v1', source, level]),
  source,
  level,
});
/** Anchor server duration to elapsed monotonic time; the client's calendar clock is irrelevant. */
export function dailyDelay(
  serverNow: string,
  nextDailyAt: string,
  receivedAt: number,
  now: number,
) {
  const duration = Date.parse(nextDailyAt) - Date.parse(serverNow);
  return Number.isFinite(duration) ? Math.max(0, duration - Math.max(0, now - receivedAt)) : 0;
}
