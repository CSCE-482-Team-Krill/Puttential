import type { Level } from '../game';
import type { Draft } from './puzzle';

/** Display cost only; saved results continue to use the existing engine/API. */
export const TILE_COST = 1 as const;

/** All field kinds supported by this engine revision are player-selectable. */
export const selectableFields = (level: Level) => level.fields;

export const selectedFieldCount = (level: Level, draft: Draft) =>
  selectableFields(level).filter((field) => draft[field.id]?.enabled === true).length;

export const displayedForceCost = (level: Level, draft: Draft) =>
  selectedFieldCount(level, draft) * TILE_COST;
