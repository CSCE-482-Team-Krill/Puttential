import { isCourseObject } from '../game';
import type { Level } from '../game';
import type { Draft } from './puzzle';

/** Display cost only; saved results continue to use the existing engine/API. */
export const TILE_COST = 1 as const;

/** Fixed course objects are excluded from the player's force inventory and cost. */
export const selectableFields = (level: Level) =>
  level.fields.filter((field) => !isCourseObject(field.force));

export const selectedFieldCount = (level: Level, draft: Draft) =>
  selectableFields(level).filter((field) => draft[field.id]?.enabled === true).length;

export const displayedForceCost = (level: Level, draft: Draft) =>
  selectedFieldCount(level, draft) * TILE_COST;
