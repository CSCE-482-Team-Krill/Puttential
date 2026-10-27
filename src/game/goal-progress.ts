import { FIXED_DT } from './simulation';
import type { GoalDefinition } from './levels/types';
import type { RenderState } from './types';

export type GoalProgress = {
  area: GoalDefinition;
  inside: boolean;
  heldTicks: number;
  holdTicks: number;
  completedTick: number | null;
  tick: number;
};
export function initialGoal(goal: GoalDefinition): GoalProgress {
  return {
    area: goal,
    inside: false,
    heldTicks: 0,
    holdTicks: Math.max(1, Math.ceil(goal.holdSeconds / FIXED_DT)),
    completedTick: null,
    tick: 0,
  };
}
export function advanceGoal(previous: GoalProgress, state: RenderState): GoalProgress {
  if (state.tick === previous.tick) return previous;
  const body = state.bodies.find((b) => b.id === previous.area.bodyId),
    b = previous.area;
  const inside =
    !state.failure &&
    !!body &&
    !body.destroyed &&
    !body.burnt &&
    !body.teleporting &&
    body.position.x >= b.minX &&
    body.position.x <= b.maxX &&
    body.position.y >= b.minY &&
    body.position.y <= b.maxY;
  const heldTicks = inside ? previous.heldTicks + 1 : 0;
  return {
    ...previous,
    inside,
    heldTicks,
    tick: state.tick,
    completedTick: state.failure
      ? null
      : (previous.completedTick ?? (heldTicks >= previous.holdTicks ? state.tick : null)),
  };
}
