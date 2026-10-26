import type { Game, Level, RenderState, Vec2 } from '../game';
import type { Metrics, Placement, PuzzleRules, SavedResult } from '../shared/puzzle-contracts';
import type { Draft, FieldDraft } from './puzzle';

/** Frontend port for the separately owned E0 delivery. Tests inject deterministic ports.
 * No guessed exports, angle-command casts, replay or path heuristics live here. */
export interface EngineAdapter {
  supports(rules: PuzzleRules): boolean;
  canonicalField(level: Level, id: string, draft: FieldDraft, rules: PuzzleRules): FieldDraft;
  placement(level: Level, draft: Draft, rules: PuzzleRules): Placement;
  applySetup(game: Game, placement: Placement): void;
  preview(game: Game, placement: Placement, maxTicks: number): readonly Vec2[];
  begin(game: Game, level: Level, rules: PuzzleRules): void;
  step(
    game: Game,
    state: RenderState,
  ): { outcome: SavedResult['outcome']; metrics: Metrics } | null;
  localRules(level: Level): PuzzleRules;
}
// E0 is absent in this checkout. Installing an agreed frontend binding is the integration seam.
export const deliveredEngine: EngineAdapter | undefined = undefined;
export const ENGINE_UNAVAILABLE =
  'Unavailable in this version. Ranked playback and rotation await compatible engine support.';
export type FieldEdit = { position?: Vec2; angle?: number; enabled?: boolean };
