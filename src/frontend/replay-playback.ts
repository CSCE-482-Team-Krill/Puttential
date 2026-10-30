import { createGame, FIXED_DT } from '../game/simulation';
import type { Game, GameSnapshot, RenderState } from '../game/types';
import type { Level } from '../game/levels/types';
import { RunEvaluator, validatePlacement } from '../game/run-evaluation';
import { advanceGoal, initialGoal } from '../game/goal-progress';
import type { Placement, PuzzleRules, SavedResult } from '../shared/puzzle-contracts';

export type ReplaySpeed = 0.5 | 1 | 2;
export type ReplayStatus = 'paused' | 'playing' | 'ended' | 'error';
const MAX_STEPS_PER_FRAME = 16;

/** A disposable spectator world; never touches drafts, run sessions, or persistence. */
export class ReplayPlayback {
  status: ReplayStatus = 'paused';
  speed: ReplaySpeed = 1;
  error: string | null = null;
  frame: RenderState;
  goal;
  private evaluator: RunEvaluator;
  private setup: GameSnapshot;
  private accumulator = 0;
  private destroyed = false;

  private constructor(
    private game: Game,
    private level: Level,
    private rules: PuzzleRules,
    private expected: SavedResult,
  ) {
    this.setup = game.snapshot();
    this.frame = game.getRenderState();
    this.goal = initialGoal(level.goal);
    this.evaluator = new RunEvaluator(level, rules);
  }

  static async create(
    level: Level,
    rules: PuzzleRules,
    placement: Placement,
    expected: SavedResult,
  ) {
    validatePlacement(level, placement, rules);
    if (expected.verification !== 'verified' || expected.outcome !== 'success' || !expected.metrics)
      throw new Error('A replay requires a verified successful solution.');
    const game = await createGame(level);
    try {
      game.applySetup(placement.commands);
      return new ReplayPlayback(game, level, rules, expected);
    } catch (error) {
      game.destroy();
      throw error;
    }
  }

  play() {
    if (!this.destroyed && this.status === 'paused') this.status = 'playing';
  }
  pause() {
    if (this.status === 'playing') this.status = 'paused';
    this.accumulator = 0;
  }
  restart() {
    if (this.destroyed) return;
    this.game.restore(this.setup);
    this.evaluator = new RunEvaluator(this.level, this.rules);
    this.goal = initialGoal(this.level.goal);
    this.frame = this.game.getRenderState();
    this.status = 'paused';
    this.error = null;
    this.accumulator = 0;
  }
  advance(seconds: number) {
    if (this.destroyed || this.status !== 'playing') return;
    // Slow devices may take longer to display a replay, but every physics tick is evaluated.
    this.accumulator = Math.min(
      this.accumulator + Math.max(0, Math.min(seconds, 0.25)) * this.speed,
      MAX_STEPS_PER_FRAME * FIXED_DT,
    );
    try {
      while (this.accumulator + 1e-12 >= FIXED_DT) {
        this.game.step();
        this.frame = this.game.getRenderState();
        this.goal = advanceGoal(this.goal, this.frame);
        this.accumulator -= FIXED_DT;
        const result = this.evaluator.step(this.game, this.frame);
        if (!result) continue;
        const expected = this.expected.metrics!;
        if (
          result.outcome !== this.expected.outcome ||
          result.metrics.forceCost !== expected.forceCost ||
          result.metrics.tileCount !== expected.tileCount ||
          result.metrics.completionTick !== expected.completionTick ||
          result.metrics.pathLengthQ !== expected.pathLengthQ
        )
          throw new Error('This replay does not match the saved result in this engine version.');
        this.status = 'ended';
        this.accumulator = 0;
        break;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Replay playback is unavailable.';
      this.status = 'error';
    }
  }
  destroy() {
    if (this.destroyed) return;
    this.pause();
    this.destroyed = true;
    this.game.destroy();
  }
}
