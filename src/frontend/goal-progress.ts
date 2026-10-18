import { FIXED_DT } from '../game';
import type { GoalDefinition, RenderState } from '../game';
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
/** Shared game UI scoring from every engine tick. This does not change the physics world. */
export function advanceGoal(previous: GoalProgress, state: RenderState): GoalProgress {
  if (state.tick === previous.tick) return previous;
  const body = state.bodies.find((b) => b.id === previous.area.bodyId),
    b = previous.area;
  const inside =
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
    completedTick: previous.completedTick ?? (heldTicks >= previous.holdTicks ? state.tick : null),
  };
}
