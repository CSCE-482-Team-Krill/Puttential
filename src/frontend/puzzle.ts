'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceGoal, initialGoal } from './goal-progress';
import type { GoalProgress } from './goal-progress';
import {
  isCourseObject,
  createGame,
  FIXED_DT,
  quantizePosition,
  levelBounds,
  shapePolygon,
  transformPolygon,
  polygonBounds,
  containsBounds,
} from '../game';
import type { Game, GameSnapshot, Level, RenderState, Vec2 } from '../game';
import type {
  Placement,
  PuzzleRules,
  SetupCommand,
  Metrics,
  SavedResult,
} from '../shared/puzzle-contracts';
import type { EngineAdapter } from './engine-adapter';
import { displayedForceCost } from './score-display';

export type Mode = 'loading' | 'setup' | 'running' | 'done' | 'error';
export type FieldDraft = Readonly<{ position: Vec2; angle?: number; enabled: boolean }>;
export type Draft = Readonly<Record<string, FieldDraft>>;
export type RunResult = Readonly<{
  solved: boolean;
  tiles: number;
  seconds: number;
  failure?: 'water' | 'lava' | 'out-of-bounds';
  forceCost?: number;
  tick?: number;
  outcome?: SavedResult['outcome'];
  metrics?: Metrics;
}>;
export type CompletedRun = Readonly<{ level: Level; result: RunResult; commands: SetupCommand[] }>;
const TRAIL_TICKS = Math.round(0.5 / FIXED_DT);
const MAX_STEPS_PER_FRAME = 8;
function initialDraft(state: RenderState): Draft {
  return Object.fromEntries(
    state.fields
      .filter((f) => !isCourseObject(f.force))
      .map((f) => [
        f.id,
        {
          position: {
            x: quantizePosition(f.position.x) / 1024,
            y: quantizePosition(f.position.y) / 1024,
          },
          angle: f.angle,
          enabled: f.enabled,
        },
      ]),
  );
}
function layoutCommands(draft: Draft) {
  let sequence = 0;
  return Object.keys(draft)
    .sort()
    .flatMap((fieldId) => {
      const field = draft[fieldId]!;
      return [
        {
          type: 'move-field' as const,
          fieldId,
          xQ: quantizePosition(field.position.x),
          yQ: quantizePosition(field.position.y),
          sequence: sequence++,
        },
        {
          type: 'set-field-enabled' as const,
          fieldId,
          enabled: field.enabled,
          sequence: sequence++,
        },
      ];
    });
}
export type ExecutionOptions = {
  rules?: PuzzleRules;
  adapter?: EngineAdapter;
  storageKey?: string;
};
/** Local execution only. Competitive starts/identity/recovery belong to CourseSession. */
export function usePuzzle(level: Level, options: ExecutionOptions = {}) {
  const gameRef = useRef<Game | null>(null);
  const setupRef = useRef<GameSnapshot | null>(null);
  const frameRef = useRef<RenderState | null>(null);
  const goalRef = useRef<GoalProgress>(initialGoal(level.goal));
  const [mode, setMode] = useState<Mode>('loading');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [draft, setDraft] = useState<Draft>({});
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [trail, setTrail] = useState<readonly Vec2[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [completedRun, setCompletedRun] = useState<CompletedRun | null>(null);
  const runRef = useRef<{ level: Level; commands: SetupCommand[] } | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedField, selectField] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const rules = options.rules ?? options.adapter?.localRules(level);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const maxTicks = rules?.maxTicks ?? 7200;

  useEffect(() => {
    let canceled = false;
    let game: Game | null = null;
    setMode('loading');
    goalRef.current = initialGoal(level.goal);
    setError(null);
    setEditError(null);
    setTrail([]);
    setResult(null);
    setCompletedRun(null);
    setAttempts(0);
    setTick(0);
    selectField(null);
    void createGame(level)
      .then((created) => {
        if (canceled) {
          created.destroy();
          return;
        }
        game = created;
        gameRef.current = created;
        setupRef.current = created.snapshot();
        frameRef.current = created.getRenderState();
        let initial = initialDraft(frameRef.current);
        const opts = optionsRef.current,
          r = rulesRef.current;
        if (opts.adapter && r)
          initial = Object.fromEntries(
            Object.entries(initial).map(([id, d]) => [
              id,
              opts.adapter!.canonicalField(level, id, d, r),
            ]),
          );
        if (opts.storageKey)
          try {
            const saved = JSON.parse(localStorage.getItem(opts.storageKey) ?? 'null');
            if (
              saved?.version === 1 &&
              Object.keys(saved.draft).length === Object.keys(initial).length
            ) {
              const restored: Record<string, FieldDraft> = {};
              for (const [id, d] of Object.entries(initial)) {
                const value = saved.draft[id];
                if (
                  !value ||
                  typeof value.enabled !== 'boolean' ||
                  !Number.isFinite(value.position?.x) ||
                  !Number.isFinite(value.position?.y) ||
                  (value.angle !== undefined && !Number.isFinite(value.angle))
                )
                  throw new Error('Invalid draft');
                const next =
                  opts.adapter && r
                    ? opts.adapter.canonicalField(level, id, value, r)
                    : {
                        ...d,
                        enabled: value.enabled,
                        position: {
                          x: quantizePosition(value.position.x) / 1024,
                          y: quantizePosition(value.position.y) / 1024,
                        },
                      };
                const field = level.fields.find((f) => f.id === id)!;
                if (
                  !containsBounds(
                    r?.placementBounds ?? levelBounds(level),
                    polygonBounds(
                      transformPolygon(
                        shapePolygon(field.shape),
                        next.position,
                        next.angle ?? field.angle,
                      ),
                    ),
                  )
                )
                  throw new Error('Invalid draft bounds');
                restored[id] = next;
              }
              initial = restored;
            }
          } catch {
            /* Incompatible or unavailable local drafts do not block playing. */
          }
        draftRef.current = initial;
        setDraft(initial);
        setHydratedKey(opts.storageKey ?? null);
        setMode('setup');
      })
      .catch((cause: unknown) => {
        if (!canceled) {
          setError(cause instanceof Error ? cause.message : 'Could not load course');
          setMode('error');
        }
      });
    return () => {
      canceled = true;
      game?.destroy();
      gameRef.current = null;
      frameRef.current = null;
    };
  }, [level]);
  useEffect(() => {
    const key = options.storageKey;
    if (!key || key === hydratedKey || mode !== 'setup' || !frameRef.current) return;
    let value = initialDraft(frameRef.current);
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (stored?.version === 1 && Object.keys(stored.draft).length === Object.keys(value).length) {
        const restored: Record<string, FieldDraft> = {};
        for (const [id, d] of Object.entries(value)) {
          const saved = stored.draft[id];
          if (
            !saved ||
            typeof saved.enabled !== 'boolean' ||
            !Number.isFinite(saved.position?.x) ||
            !Number.isFinite(saved.position?.y)
          )
            throw new Error('Invalid draft');
          const next =
            options.adapter && rules
              ? options.adapter.canonicalField(level, id, saved, rules)
              : {
                  ...d,
                  enabled: saved.enabled,
                  position: {
                    x: quantizePosition(saved.position.x) / 1024,
                    y: quantizePosition(saved.position.y) / 1024,
                  },
                };
          const definition = level.fields.find((f) => f.id === id)!;
          if (
            !containsBounds(
              rules?.placementBounds ?? levelBounds(level),
              polygonBounds(
                transformPolygon(
                  shapePolygon(definition.shape),
                  next.position,
                  next.angle ?? definition.angle,
                ),
              ),
            )
          )
            throw new Error('Invalid draft bounds');
          restored[id] = next;
        }
        value = restored;
      }
    } catch {
      /* Retain valid initial setup. */
    }
    draftRef.current = value;
    setDraft(value);
    setHydratedKey(key);
  }, [options.storageKey, hydratedKey, mode, level]);
  useEffect(() => {
    if (mode !== 'setup' || !options.storageKey || hydratedKey !== options.storageKey) return;
    try {
      localStorage.setItem(options.storageKey, JSON.stringify({ version: 1, draft }));
    } catch {
      /* Local practice remains usable. */
    }
  }, [draft, mode, options.storageKey, hydratedKey]);
  useEffect(() => {
    const game = gameRef.current;
    if (mode !== 'setup' || !game) return;
    if (optionsRef.current.adapter && rulesRef.current) {
      setTrail(
        optionsRef.current.adapter.preview(
          game,
          optionsRef.current.adapter.placement(level, draft, rulesRef.current),
          TRAIL_TICKS,
          level.goal.bodyId,
        ),
      );
      return;
    }
    const prediction = game.predict(layoutCommands(draft), {
      maxTicks: Math.min(level.prediction?.maxTicks ?? TRAIL_TICKS, TRAIL_TICKS),
      sampleEveryTicks: 1,
    });
    setTrail(
      prediction.samples.flatMap((sample) =>
        sample.bodies.filter((body) => body.id === level.goal.bodyId).map((body) => body.position),
      ),
    );
  }, [draft, level, mode]);
  useEffect(() => {
    const game = gameRef.current;
    if (mode !== 'running' || !game) return;
    let accumulator = 0,
      previous = performance.now();
    let frame = requestAnimationFrame(function loop(now) {
      const elapsed = Math.max(0, now - previous) / 1000;
      accumulator = Math.min(accumulator + elapsed, MAX_STEPS_PER_FRAME * FIXED_DT);
      previous = now;
      while (accumulator >= FIXED_DT) {
        game.step();
        const state = game.getRenderState();
        goalRef.current = advanceGoal(goalRef.current, state);
        frameRef.current = state;
        accumulator -= FIXED_DT;
        const authoritative = optionsRef.current.adapter?.step(game, state);
        const goal = goalRef.current,
          target = state.bodies.find((b) => b.id === level.goal.bodyId);
        const failure = state.failure?.reason ?? (target?.burnt ? 'lava' : target?.destroyed);
        const solved = !failure && goal.completedTick !== null;
        const sleeping = state.bodies.every((b) => b.sleeping || b.destroyed);
        const stopped =
          sleeping &&
          !goal.inside &&
          Object.keys(game.snapshot().pendingTeleports ?? {}).length === 0;
        const localOutcome =
          failure ??
          (solved ? 'success' : stopped ? 'stopped' : state.tick >= maxTicks ? 'timeout' : null);
        // Compatibility callers without an adapter remain unranked.
        const outcome = optionsRef.current.adapter ? authoritative?.outcome : localOutcome;
        if (outcome) {
          const finished: RunResult = {
            solved: outcome === 'success',
            ...(outcome === 'water' || outcome === 'lava' || outcome === 'out-of-bounds'
              ? { failure: outcome }
              : {}),
            outcome,
            tiles:
              authoritative?.metrics.tileCount ??
              state.fields.filter((f) => f.enabled && !isCourseObject(f.force)).length,
            seconds: (authoritative?.metrics.completionTick ?? state.tick) * FIXED_DT,
            tick: state.tick,
            forceCost:
              authoritative?.metrics.forceCost ??
              displayedForceCost(level, draftRef.current, rulesRef.current?.tileCosts),
            ...(authoritative ? { metrics: authoritative.metrics } : {}),
          };
          setTick(state.tick);
          setResult(finished);
          if (runRef.current) setCompletedRun({ ...runRef.current, result: finished });
          modeRef.current = 'done';
          setMode('done');
          return;
        }
      }
      setTick(frameRef.current?.tick ?? 0);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, level, maxTicks]);
  const getPlacement = useCallback((): Placement => {
    const adapter = optionsRef.current.adapter,
      r = rulesRef.current;
    if (!adapter || !r) throw new Error('Compatible engine support is unavailable.');
    return adapter.placement(level, draftRef.current, r);
  }, [level]);
  const play = useCallback(
    (accepted?: Placement) => {
      const game = gameRef.current,
        setup = setupRef.current;
      if (!game || !setup || modeRef.current !== 'setup') return;
      game.restore(setup);
      goalRef.current = initialGoal(level.goal);
      const adapter = optionsRef.current.adapter,
        r = rulesRef.current;
      if (adapter && r) {
        const placement = accepted ?? getPlacement();
        adapter.applySetup(game, placement);
        adapter.begin(game, level, r);
        runRef.current = { level, commands: structuredClone(placement.commands) };
      } else {
        if (accepted) throw new Error('Competitive engine support is unavailable.');
        const commands = layoutCommands(draftRef.current);
        runRef.current = { level, commands };
        for (const command of commands) game.queueCommand(command);
      }
      setAttempts((c) => c + 1);
      setResult(null);
      setCompletedRun(null);
      setTick(0);
      modeRef.current = 'running';
      setMode('running');
    },
    [getPlacement, level],
  );
  const rewind = useCallback(() => {
    const game = gameRef.current,
      setup = setupRef.current;
    if (!game || !setup) return;
    game.restore(setup);
    goalRef.current = initialGoal(level.goal);
    frameRef.current = game.getRenderState();
    setResult(null);
    setCompletedRun(null);
    setTick(0);
    modeRef.current = 'setup';
    setMode('setup');
  }, [level]);
  const updateField = useCallback(
    (id: string, change: Partial<FieldDraft>) => {
      if (modeRef.current !== 'setup') return;
      const field = level.fields.find((f) => f.id === id && !isCourseObject(f.force)),
        current = draftRef.current[id];
      if (!field || !current) return;
      try {
        let next = { ...current, ...change };
        const adapter = optionsRef.current.adapter,
          r = rulesRef.current;
        if (adapter && r) next = adapter.canonicalField(level, id, next, r);
        else {
          if (change.angle !== undefined && change.angle !== current.angle)
            throw new Error('Rotation is unavailable in this version.');
          next = {
            ...next,
            position: {
              x: quantizePosition(next.position.x) / 1024,
              y: quantizePosition(next.position.y) / 1024,
            },
          };
        }
        if (
          !containsBounds(
            r?.placementBounds ?? levelBounds(level),
            polygonBounds(
              transformPolygon(shapePolygon(field.shape), next.position, next.angle ?? field.angle),
            ),
          )
        )
          throw new Error('Keep the entire field inside the course.');
        const value = { ...draftRef.current, [id]: next };
        draftRef.current = value;
        setDraft(value);
        setEditError(null);
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Invalid field position.');
      }
    },
    [level],
  );
  return {
    mode,
    error,
    editError,
    draft,
    trail,
    result,
    completedRun,
    attempts,
    tick,
    maxTicks,
    frameRef,
    goalRef,
    selectedField,
    selectField,
    getPlacement,
    play,
    rewind,
    rotationAvailable: !!options.adapter && !!rules?.rotationAllowed,
    resetLayout: () => {
      if (modeRef.current !== 'setup') return;
      const game = gameRef.current;
      if (game) {
        let value = initialDraft(game.getRenderState());
        const adapter = optionsRef.current.adapter,
          rules = rulesRef.current;
        if (adapter && rules)
          value = Object.fromEntries(
            Object.entries(value).map(([id, field]) => [
              id,
              adapter.canonicalField(level, id, field, rules),
            ]),
          );
        draftRef.current = value;
        setDraft(value);
      }
    },
    moveField: (id: string, position: Vec2) => updateField(id, { position }),
    rotateField: (id: string, angle: number) => updateField(id, { angle }),
    toggleField: (id: string) => {
      selectField(id);
      updateField(id, { enabled: !draftRef.current[id]?.enabled });
    },
  };
}
