import type { Game, Level, RenderState, Vec2 } from '../game';
import type { Metrics, Placement, PuzzleRules, SavedResult } from '../shared/puzzle-contracts';
import type { Draft, FieldDraft } from './puzzle';
import {
  canonicalField,
  defaultRules,
  makePlacement,
  RunEvaluator,
  supportsRules,
} from '../game/run-evaluation';

/** The browser consumes the same setup and evaluation functions as server replay. */
export interface EngineAdapter {
  supports(rules: PuzzleRules): boolean;
  canonicalField(level: Level, id: string, draft: FieldDraft, rules: PuzzleRules): FieldDraft;
  placement(level: Level, draft: Draft, rules: PuzzleRules): Placement;
  applySetup(game: Game, placement: Placement): void;
  preview(game: Game, placement: Placement, maxTicks: number, bodyId?: string): readonly Vec2[];
  begin(game: Game, level: Level, rules: PuzzleRules): void;
  step(
    game: Game,
    state: RenderState,
  ): { outcome: SavedResult['outcome']; metrics: Metrics } | null;
  localRules(level: Level): PuzzleRules;
}
const evaluators = new WeakMap<Game, RunEvaluator>();
export const deliveredEngine: EngineAdapter = {
  supports: supportsRules,
  canonicalField,
  placement: makePlacement,
  applySetup: (game, placement) => game.applySetup(placement.commands),
  preview: (game, placement, maxTicks, bodyId) =>
    game
      .predict(placement.commands, { maxTicks, sampleEveryTicks: 1 })
      .samples.flatMap((sample) =>
        sample.bodies
          .filter((body, i) => (bodyId ? body.id === bodyId : i === 0))
          .map((body) => body.position),
      ),
  begin: (game, level, rules) => {
    evaluators.set(game, new RunEvaluator(level, rules));
  },
  step: (game, state) => {
    const evaluator = evaluators.get(game);
    if (!evaluator) throw new Error('Run evaluator was not initialized');
    return evaluator.step(game, state);
  },
  localRules: defaultRules,
};
export const ENGINE_UNAVAILABLE =
  'Unavailable in this version. Ranked playback and rotation await compatible engine support.';
export type FieldEdit = { position?: Vec2; angle?: number; enabled?: boolean };
