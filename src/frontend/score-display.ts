import { isCourseObject } from '../game';
import type { Level } from '../game';
import type { Draft } from './puzzle';

/** Explicit unranked fallback; published puzzles always supply their own cost map. */
export const TILE_COST = 1 as const;

/** Fixed course objects are excluded from the player's force inventory and cost. */
export const selectableFields = (level: Level) =>
  level.fields.filter((field) => !isCourseObject(field.force));

export const selectedFieldCount = (level: Level, draft: Draft) =>
  selectableFields(level).filter((field) => draft[field.id]?.enabled === true).length;

export const displayedForceCost = (level: Level, draft: Draft, costs?: Record<string, number>) =>
  selectableFields(level).reduce(
    (sum, field) => sum + (draft[field.id]?.enabled ? (costs?.[field.id] ?? TILE_COST) : 0),
    0,
  );
