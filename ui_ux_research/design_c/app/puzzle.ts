"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, FIXED_DT, quantizePosition } from "@game";
import type { Game, GameCommand, GameSnapshot, Level, RenderState, Vec2 } from "@game";

export type Mode = "loading" | "setup" | "running" | "done";
export type FieldDraft = Readonly<{ position: Vec2; enabled: boolean }>;
export type Draft = Readonly<Record<string, FieldDraft>>;
export type RunResult = Readonly<{ solved: boolean; tiles: number; seconds: number }>;

/** How much of the run the dotted preview shows. */
const TRAIL_TICKS = 120;
/** Caps catch-up work after a slow frame or a background tab. */
const MAX_STEPS_PER_FRAME = 8;

function initialDraft(state: RenderState): Draft {
  return Object.fromEntries(state.fields.map((field) => [
    field.id,
    { position: field.position, enabled: field.enabled },
  ]));
}

function layoutCommands(draft: Draft): GameCommand[] {
  let sequence = 0;
  return Object.entries(draft).flatMap(([fieldId, field]) => [
    {
      type: "move-field" as const,
      fieldId,
      xQ: quantizePosition(field.position.x),
      yQ: quantizePosition(field.position.y),
      sequence: sequence++,
    },
    { type: "set-field-enabled" as const, fieldId, enabled: field.enabled, sequence: sequence++ },
  ]);
}

export function usePuzzle(level: Level) {
  const gameRef = useRef<Game | null>(null);
  const setupRef = useRef<GameSnapshot | null>(null);
  /** Latest engine state, read by the canvas every animation frame. */
  const frameRef = useRef<RenderState | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [draft, setDraft] = useState<Draft>({});
  const [trail, setTrail] = useState<readonly Vec2[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    setMode("loading");
    setResult(null);
    setAttempts(0);
    void createGame(level).then((created) => {
      if (cancelled) {
        created.destroy();
        return;
      }
      game = created;
      gameRef.current = created;
      setupRef.current = created.snapshot();
      frameRef.current = created.getRenderState();
      setDraft(initialDraft(frameRef.current));
      setMode("setup");
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
    if (mode !== "setup" || game === null) return;
    const prediction = game.predict(layoutCommands(draft), {
      maxTicks: TRAIL_TICKS,
    });
    setTrail(prediction.samples.flatMap((sample) =>
      sample.bodies.filter((body) => body.id === level.goal.bodyId).map((body) => body.position)));
  }, [draft, level, mode]);

  useEffect(() => {
    const game = gameRef.current;
    if (mode !== "running" || game === null) return;
    let accumulator = 0;
    let previous = performance.now();
    let frame = requestAnimationFrame(function loop(now) {
      const elapsed = Math.max(0, now - previous) / 1000;
      accumulator = Math.min(accumulator + elapsed, MAX_STEPS_PER_FRAME * FIXED_DT);
      previous = now;
      while (accumulator >= FIXED_DT) {
        game.step();
        accumulator -= FIXED_DT;
      }
      const state = game.getRenderState();
      frameRef.current = state;

      const solved = state.goal.completedTick !== null;
      // A body resting inside the goal still has to finish its hold.
      const stopped = state.bodies.every((body) => body.sleeping) && !state.goal.inside;
      if (solved || stopped) {
        setResult({
          solved,
          tiles: state.fields.filter((field) => field.enabled).length,
          seconds: (state.goal.completedTick ?? state.tick) * FIXED_DT,
        });
        setMode("done");
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
    for (const command of layoutCommands(draft)) game.queueCommand(command);
    setAttempts((count) => count + 1);
    setResult(null);
    setMode("running");
  }, [draft]);

  /** Stops a run and returns to the same layout. */
  const rewind = useCallback(() => {
    const game = gameRef.current;
    const setup = setupRef.current;
    if (game === null || setup === null) return;
    game.restore(setup);
    frameRef.current = game.getRenderState();
    setResult(null);
    setMode("setup");
  }, []);

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
    draft,
    trail,
    result,
    attempts,
    frameRef,
    play,
    rewind,
    resetLayout,
    moveField: (id: string, position: Vec2) => updateField(id, { position }),
    toggleField: (id: string) => updateField(id, { enabled: !draft[id]?.enabled }),
  };
}
