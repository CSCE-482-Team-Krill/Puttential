import type { ReplayAccess } from '../shared/puzzle-contracts';
import { centralMidnight, shiftDate } from './puzzle-date';

export function replayAccess(
  date: string | null,
  now: Date,
  canceled = false,
  publishedAt = now,
): ReplayAccess {
  const unlocksAt = date === null ? publishedAt : centralMidnight(shiftDate(date, 1));
  return {
    available: !canceled && (date === null || now >= unlocksAt),
    unlocksAt: unlocksAt.toISOString(),
  };
}
