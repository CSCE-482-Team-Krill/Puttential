import { createGame, FIXED_DT } from '../game/simulation';
import type { Game, GameSnapshot, SoundEvent, RenderState } from '../game/types';
import type { Level } from '../game/levels/types';
import { RunEvaluator, validatePlacement, simulationOptions } from '../game/run-evaluation';
import { advanceGoal, initialGoal } from '../game/goal-progress';
import type { Placement, PuzzleRules, SavedResult } from '../shared/puzzle-contracts';

export type ReplaySpeed = 0.5 | 1 | 2 | 4;
export type ReplayStatus = 'paused' | 'playing' | 'ended' | 'error';
export type GoalInterval = { startTick: number; endTick: number };
const MAX_STEPS_PER_FRAME = 16;

/** A disposable spectator world; never touches drafts, run sessions, or persistence. */
export class ReplayPlayback {
  status: ReplayStatus = 'paused';
  speed: ReplaySpeed = 1;
  error: string | null = null;
  frame: RenderState;
  goal;
  goalIntervals: readonly GoalInterval[] = [];
  private evaluator: RunEvaluator;
  private setup: GameSnapshot;
  private accumulator = 0;
  private destroyed = false;
  private events: SoundEvent[] = [];

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
    const game = await createGame(level, { ...simulationOptions(rules), soundEvents: true });
    try {
      game.applySetup(placement.commands);
      const playback = new ReplayPlayback(game, level, rules, expected);
      playback.goalIntervals = playback.findGoalIntervals();
      playback.restart();
      return playback;
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
    this.events = [];
  }
  /** Pauses and deterministically advances to an exact replay tick without emitting seek audio. */
  seek(requestedTick: number) {
    if (this.destroyed || !Number.isFinite(requestedTick)) return;
    const completionTick = this.expected.metrics!.completionTick;
    const targetTick = Math.min(completionTick, Math.max(0, Math.round(requestedTick)));
    this.pause();
    if (targetTick < this.frame.tick || this.status === 'error') this.restart();
    try {
      while (this.frame.tick < targetTick && !this.step(false));
      if (this.status !== 'ended' && this.status !== 'error') this.status = 'paused';
      this.events = [];
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Replay playback is unavailable.';
      this.status = 'error';
      this.events = [];
    }
  }
  /** Physics events simulated since the last call, for sound. */
  takeSoundEvents(): readonly SoundEvent[] {
    const events = this.events;
    this.events = [];
    return events;
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
        const ended = this.step(true);
        this.accumulator -= FIXED_DT;
        if (ended) break;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Replay playback is unavailable.';
      this.status = 'error';
    }
  }
  private step(emitSound: boolean) {
    this.game.step();
    const events = this.game.soundEvents();
    if (emitSound) this.events.push(...events);
    this.frame = this.game.getRenderState();
    this.goal = advanceGoal(this.goal, this.frame);
    const result = this.evaluator.step(this.game, this.frame);
    if (!result) return false;
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
    return true;
  }
  private findGoalIntervals() {
    const intervals: GoalInterval[] = [];
    const completionTick = this.expected.metrics!.completionTick;
    let goal = initialGoal(this.level.goal);
    let startTick: number | null = null;
    for (let tick = 1; tick <= completionTick; tick++) {
      this.game.step();
      this.game.soundEvents();
      const frame = this.game.getRenderState();
      goal = advanceGoal(goal, frame);
      if (goal.inside && startTick === null) startTick = frame.tick;
      else if (!goal.inside && startTick !== null) {
        intervals.push({ startTick, endTick: frame.tick });
        startTick = null;
      }
    }
    if (startTick !== null) intervals.push({ startTick, endTick: completionTick + 1 });
    return intervals;
  }
  destroy() {
    if (this.destroyed) return;
    this.pause();
    this.destroyed = true;
    this.game.destroy();
  }
}
