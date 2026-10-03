import { pointInPolygon } from '../geometry/polygon';
import type { FieldForceDefinition } from '../levels/types';
import type { Vec2 } from '../types';

/** Keeps radial forces finite at the source point. */
const RADIAL_SOFTENING = 0.05;

/** Body material at one quadrature point, expressed in the field's local frame. */
export type FieldSample = Readonly<{
  point: Vec2;
  /** Velocity of the body material at `point`. */
  velocity: Vec2;
  /** Density of the body piece being sampled. */
  density: number;
}>;

/** Force per unit area at the sample, in the field's local frame. Must be pure so replays stay deterministic. */
export type ForceDensity = (sample: FieldSample) => Vec2;

function radialDensity(source: Vec2, signedStrength: number): ForceDensity {
  return ({ point }) => {
    const dx = point.x - source.x;
    const dy = point.y - source.y;
    const scale = signedStrength / Math.sqrt(dx * dx + dy * dy + RADIAL_SOFTENING ** 2);
    return { x: dx * scale, y: dy * scale };
  };
}

/** Builds the force law a level's force definition describes. */
export function forceDensity(force: FieldForceDefinition): ForceDensity {
  switch (force.kind) {
    case 'uniform': {
      const value = { x: force.density.x, y: force.density.y };
      return () => value;
    }
    case 'attractor':
      return radialDensity({ x: force.source.x, y: force.source.y }, -force.strength);
    case 'repulsor':
      return radialDensity({ x: force.source.x, y: force.source.y }, force.strength);
    case 'vortex': {
      const { center: { x, y }, strength } = force;
      return ({ point }) => {
        const dx = point.x - x;
        const dy = point.y - y;
        const scale = strength / Math.sqrt(dx * dx + dy * dy + RADIAL_SOFTENING ** 2);
        return { x: -dy * scale, y: dx * scale };
      };
    }
    case 'drag': {
      const { coefficient } = force;
      return ({ velocity }) => ({ x: -coefficient * velocity.x, y: -coefficient * velocity.y });
    }
  }
}

/** Returns an error message when the force is invalid for this polygon. */
export function forceValidationError(
  force: FieldForceDefinition,
  localPolygon: readonly Vec2[],
): string | null {
  switch (force.kind) {
    case 'uniform':
      return null;
    case 'attractor':
    case 'repulsor':
      if (!(force.strength > 0)) return 'strength must be positive';
      return pointInPolygon(force.source, localPolygon) ? null : 'source must be inside the polygon';
    case 'vortex':
      if (force.strength === 0) return 'strength must not be zero';
      return pointInPolygon(force.center, localPolygon) ? null : 'center must be inside the polygon';
    case 'drag':
      // Keep `coefficient / density` well below the tick rate (120) so the explicit step stays stable.
      return force.coefficient > 0 ? null : 'coefficient must be positive';
  }
}
