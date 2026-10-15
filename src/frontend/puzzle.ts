'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceGoal, initialGoal } from './goal-progress';
import type { GoalProgress } from './goal-progress';
import { createGame, FIXED_DT, quantizePosition } from '../game';
import type { Game, GameCommand, GameSnapshot, Level, RenderState, Vec2 } from '../game';

export type Mode = 'loading' | 'setup' | 'running' | 'done' | 'error';
export type FieldDraft = Readonly<{ position: Vec2; enabled: boolean }>;
export type Draft = Readonly<Record<string, FieldDraft>>;
export type RunResult = Readonly<{ solved: boolean; tiles: number; seconds: number }>;
export type CompletedRun = Readonly<{
  level: Level;
  result: RunResult;
  commands: GameCommand[];
}>;

/** How much of the run the dotted preview shows. */
const TRAIL_TICKS = 120;
/** Caps catch-up work after a slow frame or a background tab. */
const MAX_STEPS_PER_FRAME = 8;

function initialDraft(state: RenderState): Draft {
  return Object.fromEntries(
    state.fields.map((field) => [field.id, { position: field.position, enabled: field.enabled }]),
  );
}

function layoutCommands(draft: Draft): GameCommand[] {
  let sequence = 0;
  return Object.entries(draft).flatMap(([fieldId, field]) => [
    {
      type: 'move-field' as const,
      fieldId,
      xQ: quantizePosition(field.position.x),
      yQ: quantizePosition(field.position.y),
      sequence: sequence++,
    },
    { type: 'set-field-enabled' as const, fieldId, enabled: field.enabled, sequence: sequence++ },
  ]);
}

export function usePuzzle(level: Level) {
  const gameRef = useRef<Game | null>(null);
  const setupRef = useRef<GameSnapshot | null>(null);
  /** Latest engine state, read by the canvas every animation frame. */
  const frameRef = useRef<RenderState | null>(null);
  const goalRef = useRef<GoalProgress>(initialGoal(level.goal));
  const [mode, setMode] = useState<Mode>('loading');
  const [draft, setDraft] = useState<Draft>({});
  const [trail, setTrail] = useState<readonly Vec2[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [completedRun, setCompletedRun] = useState<CompletedRun | null>(null);
  const runRef = useRef<{ level: Level; commands: GameCommand[] } | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    setMode('loading');
    goalRef.current = initialGoal(level.goal);
    setError(null);
    setTrail([]);
    setResult(null);
    setCompletedRun(null);
    setAttempts(0);
    void createGame(level)
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        game = created;
        gameRef.current = created;
        setupRef.current = created.snapshot();
        frameRef.current = created.getRenderState();
        setDraft(initialDraft(frameRef.current));
        setMode('setup');
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load course');
          setMode('error');
        }
      });
    return () => {
      cancelled = true;
      game?.destroy();
      gameRef.current = null;
      frameRef.current = null;
    };
  }, [level]);

  // Preview the first moments of the run whenever the layout changes.
  useEffect(() => {
    const game = gameRef.current;
    if (mode !== 'setup' || game === null) return;
    const prediction = game.predict(
      layoutCommands(draft),
      level.prediction ?? { maxTicks: TRAIL_TICKS, sampleEveryTicks: 1 },
    );
    setTrail(
      prediction.samples.flatMap((sample) =>
        sample.bodies.filter((body) => body.id === level.goal.bodyId).map((body) => body.position),
      ),
    );
  }, [draft, level, mode]);

  useEffect(() => {
    const game = gameRef.current;
    if (mode !== 'running' || game === null) return;
    let accumulator = 0;
    let previous = performance.now();
    let frame = requestAnimationFrame(function loop(now) {
      const elapsed = Math.max(0, now - previous) / 1000;
      accumulator = Math.min(accumulator + elapsed, MAX_STEPS_PER_FRAME * FIXED_DT);
      previous = now;
      while (accumulator >= FIXED_DT) {
        game.step();
        goalRef.current = advanceGoal(goalRef.current, game.getRenderState());
        accumulator -= FIXED_DT;
      }
      const state = game.getRenderState();
      frameRef.current = state;

      const goal = goalRef.current;
      const solved = goal.completedTick !== null;
      // A body resting inside the goal still has to finish its hold.
      const stopped = state.bodies.every((body) => body.sleeping) && !goal.inside;
      if (solved || stopped) {
        const finished = {
          solved,
          tiles: state.fields.filter((field) => field.enabled).length,
          seconds: (goal.completedTick ?? state.tick) * FIXED_DT,
        };
        setResult(finished);
        if (runRef.current) setCompletedRun({ ...runRef.current, result: finished });
        setMode('done');
        return;
      }
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const play = useCallback(() => {
    const game = gameRef.current;
    const setup = setupRef.current;
    if (game === null || setup === null) return;
    game.restore(setup);
    goalRef.current = initialGoal(level.goal);
    const commands = layoutCommands(draft);
    runRef.current = { level, commands };
    for (const command of commands) game.queueCommand(command);
    setAttempts((count) => count + 1);
    setResult(null);
    setCompletedRun(null);
    setMode('running');
  }, [draft, level]);

  /** Stops a run and returns to the same layout. */
  const rewind = useCallback(() => {
    const game = gameRef.current;
    const setup = setupRef.current;
    if (game === null || setup === null) return;
    game.restore(setup);
    goalRef.current = initialGoal(level.goal);
    frameRef.current = game.getRenderState();
    setResult(null);
    setCompletedRun(null);
    setMode('setup');
  }, [level]);

  const resetLayout = useCallback(() => {
    const game = gameRef.current;
    if (game === null) return;
    rewind();
    setDraft(initialDraft(game.getRenderState()));
  }, [rewind]);

  const updateField = useCallback((id: string, change: Partial<FieldDraft>) => {
    setDraft((current) => {
      const field = current[id];
      return field === undefined ? current : { ...current, [id]: { ...field, ...change } };
    });
  }, []);

  return {
    mode,
    error,
    draft,
    trail,
    result,
    completedRun,
    attempts,
    frameRef,
    goalRef,
    play,
    rewind,
    resetLayout,
    moveField: (id: string, position: Vec2) => updateField(id, { position }),
    toggleField: (id: string) => updateField(id, { enabled: !draft[id]?.enabled }),
  };
}
