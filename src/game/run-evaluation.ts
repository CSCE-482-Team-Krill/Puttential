import { createGame } from './simulation';
import { ANGLE_QUANTUM, quantizePosition } from './commands';
import { levelBounds } from './levels/codec';
import { containsBounds } from './levels/document';
import { polygonBounds, transformPolygon } from './geometry/polygon';
import { shapePolygon } from './geometry/shapes';
import { isCourseObject } from './objects/catalog';
import { initialGoal, advanceGoal } from './goal-progress';
import type { Level } from './levels/types';
import type { Game, RenderState, Vec2 } from './types';
import type { Metrics, Placement, PuzzleRules, SavedResult } from '../shared/puzzle-contracts';

export const SIMULATION_VERSION = 'puttential-rapier-0.20.0-v2';
export const RULES_VERSION = 'puttential-daily-v1';
export type TileDraft = { position: Vec2; angle?: number; enabled: boolean };
export const supportsRules = (r: PuzzleRules) =>
  r.simulationVersion === SIMULATION_VERSION && r.rulesVersion === RULES_VERSION;
export function defaultRules(level: Level): PuzzleRules {
  return {
    simulationVersion: SIMULATION_VERSION,
    rulesVersion: RULES_VERSION,
    maxTicks: 7200,
    rotationAllowed: true,
    placementBounds: levelBounds(level),
    tileCosts: Object.fromEntries(
      level.fields.filter((f) => !isCourseObject(f.force)).map((f) => [f.id, 1]),
    ),
  };
}
export function canonicalField(
  level: Level,
  id: string,
  value: TileDraft,
  rules: PuzzleRules,
): TileDraft {
  const field = level.fields.find((f) => f.id === id && !isCourseObject(f.force));
  if (!field || typeof value.enabled !== 'boolean' || !Number.isFinite(value.angle ?? field.angle))
    throw new Error('Invalid tile');
  const angleQ = ((Math.round((value.angle ?? field.angle) / ANGLE_QUANTUM) % 3600) + 3600) % 3600;
  const next = {
    position: {
      x: quantizePosition(value.position.x) / 1024,
      y: quantizePosition(value.position.y) / 1024,
    },
    angle: rules.rotationAllowed ? angleQ * ANGLE_QUANTUM : field.angle,
    enabled: value.enabled,
  };
  const bounds = polygonBounds(
    transformPolygon(shapePolygon(field.shape), next.position, next.angle),
  );
  if (!containsBounds(rules.placementBounds, bounds))
    throw new Error('Keep the entire tile inside the course.');
  return next;
}
export function makePlacement(
  level: Level,
  draft: Readonly<Record<string, TileDraft>>,
  rules: PuzzleRules,
): Placement {
  let sequence = 0;
  const commands: Placement['commands'] = [];
  for (const field of [...level.fields]
    .filter((f) => !isCourseObject(f.force))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const raw = draft[field.id];
    if (!raw) throw new Error('Missing tile');
    const d = canonicalField(level, field.id, raw, rules);
    commands.push({
      type: 'move-field',
      fieldId: field.id,
      xQ: quantizePosition(d.position.x),
      yQ: quantizePosition(d.position.y),
      sequence: sequence++,
    });
    if (rules.rotationAllowed)
      commands.push({
        type: 'set-field-angle',
        fieldId: field.id,
        angleQ: ((Math.round(d.angle! / ANGLE_QUANTUM) % 3600) + 3600) % 3600,
        sequence: sequence++,
      });
    commands.push({
      type: 'set-field-enabled',
      fieldId: field.id,
      enabled: d.enabled,
      sequence: sequence++,
    });
  }
  return {
    levelId: level.id,
    levelVersion: level.version,
    rulesVersion: rules.rulesVersion,
    simulationVersion: rules.simulationVersion,
    commands,
  };
}
export function validatePlacement(level: Level, placement: Placement, rules: PuzzleRules): void {
  if (
    !supportsRules(rules) ||
    placement.levelId !== level.id ||
    placement.levelVersion !== level.version ||
    placement.rulesVersion !== rules.rulesVersion ||
    placement.simulationVersion !== rules.simulationVersion
  )
    throw new Error('Unsupported course versions');
  const draft: Record<string, TileDraft> = {};
  for (const field of level.fields.filter((f) => !isCourseObject(f.force)))
    draft[field.id] = { position: field.position, angle: field.angle, enabled: field.enabled };
  for (const c of placement.commands) {
    const d = draft[c.fieldId];
    if (!d) throw new Error('Unknown or fixed tile');
    if (c.type === 'move-field') d.position = { x: c.xQ / 1024, y: c.yQ / 1024 };
    if (c.type === 'set-field-angle') d.angle = c.angleQ * ANGLE_QUANTUM;
    if (c.type === 'set-field-enabled') d.enabled = c.enabled;
  }
  const canonical = makePlacement(level, draft, rules);
  if (
    canonical.commands.length !== placement.commands.length ||
    canonical.commands.some((c, i) =>
      Object.entries(c).some(([key, value]) => (placement.commands[i] as any)?.[key] !== value),
    )
  )
    throw new Error('Setup is not canonical');
}
export class RunEvaluator {
  private goal;
  private distance = 0;
  private previousTick = 0;
  constructor(
    private level: Level,
    private rules: PuzzleRules,
  ) {
    this.goal = initialGoal(level.goal);
  }
  step(
    game: Game,
    state: RenderState,
  ): { outcome: SavedResult['outcome']; metrics: Metrics } | null {
    if (state.tick !== this.previousTick + 1)
      throw new Error('Evaluation requires every simulation tick');
    this.previousTick = state.tick;
    this.distance += game.movement()[this.level.goal.bodyId] ?? 0;
    this.goal = advanceGoal(this.goal, state);
    const target = state.bodies.find((b) => b.id === this.level.goal.bodyId);
    const failure = target?.burnt ? 'lava' : target?.destroyed;
    const stopped =
      state.bodies.every((b) => b.sleeping || b.destroyed) &&
      !this.goal.inside &&
      !game.hasPendingTeleports();
    const outcome =
      failure ??
      (this.goal.completedTick !== null
        ? 'success'
        : stopped
          ? 'stopped'
          : state.tick >= this.rules.maxTicks
            ? 'timeout'
            : null);
    if (!outcome) return null;
    const fields = state.fields.filter((f) => f.enabled && !isCourseObject(f.force));
    return {
      outcome,
      metrics: {
        forceCost: fields.reduce((sum, f) => sum + this.rules.tileCosts[f.id]!, 0),
        tileCount: fields.length,
        completionTick: state.tick,
        pathLengthQ: Math.round(this.distance * 1024),
      },
    };
  }
}
export async function replayRun(level: Level, placement: Placement, rules: PuzzleRules) {
  validatePlacement(level, placement, rules);
  const game = await createGame(level);
  try {
    game.applySetup(placement.commands);
    const evaluator = new RunEvaluator(level, rules);
    for (let tick = 0; tick < rules.maxTicks; tick++) {
      game.step();
      const result = evaluator.step(game, game.getRenderState());
      if (result) return result;
    }
    throw new Error('Run did not terminate');
  } finally {
    game.destroy();
  }
}
