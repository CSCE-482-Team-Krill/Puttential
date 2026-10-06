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
  }
}

/** Returns an error message when the force is invalid for this polygon. */
export function forceValidationError(
  force: FieldForceDefinition,
  localPolygon: readonly Vec2[],
): string | null {
  if (force.kind === 'uniform') return null;
  if (!(force.strength > 0)) return 'strength must be positive';
  return pointInPolygon(force.source, localPolygon) ? null : 'source must be inside the polygon';
}
