import type { ReplayAccess } from '../shared/puzzle-contracts';
import { centralMidnight, shiftDate } from './puzzle-date';

export function replayAccess(date: string, now: Date, canceled = false): ReplayAccess {
  const unlocksAt = centralMidnight(shiftDate(date, 1));
  return { available: !canceled && now >= unlocksAt, unlocksAt: unlocksAt.toISOString() };
}
