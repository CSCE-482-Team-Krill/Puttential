import { pointInPolygon } from '../geometry/polygon';
import type { FieldForce } from '../levels/types';
import type { Vec2 } from '../types';

/** Keeps radial forces finite at the source point. */
const RADIAL_SOFTENING = 0.05;

function isFiniteVec2(vector: Vec2): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y);
}

/** Constant force per unit area. */
export function uniformForce(density: Vec2): FieldForce {
  const value = { x: density.x, y: density.y };
  return {
    kind: 'uniform',
    params: { density: value },
    densityAt: () => value,
    validate: () => (isFiniteVec2(value) ? null : 'density must be finite'),
  };
}

function radialForce(kind: string, source: Vec2, strength: number, direction: 1 | -1): FieldForce {
  const origin = { x: source.x, y: source.y };
  const signedStrength = direction * strength;
  return {
    kind,
    params: { source: origin, strength },
    densityAt: ({ point }) => {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const scale = signedStrength / Math.sqrt(dx * dx + dy * dy + RADIAL_SOFTENING ** 2);
      return { x: dx * scale, y: dy * scale };
    },
    validate: (localPolygon) => {
      if (!isFiniteVec2(origin)) return 'source must be finite';
      if (!(strength > 0) || !Number.isFinite(strength)) return 'strength must be positive and finite';
      return pointInPolygon(origin, localPolygon) ? null : 'source must be inside the polygon';
    },
  };
}

/** Pulls toward a local source point with `strength` force per unit area. */
export function attractorForce(source: Vec2, strength: number): FieldForce {
  return radialForce('attractor', source, strength, -1);
}

/** Pushes away from a local source point with `strength` force per unit area. */
export function repulsorForce(source: Vec2, strength: number): FieldForce {
  return radialForce('repulsor', source, strength, 1);
}

/** Swirls around a local center; positive strength turns counter-clockwise. */
export function vortexForce(center: Vec2, strength: number): FieldForce {
  const origin = { x: center.x, y: center.y };
  return {
    kind: 'vortex',
    params: { center: origin, strength },
    densityAt: ({ point }) => {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const scale = strength / Math.sqrt(dx * dx + dy * dy + RADIAL_SOFTENING ** 2);
      return { x: -dy * scale, y: dx * scale };
    },
    validate: (localPolygon) => {
      if (!isFiniteVec2(origin)) return 'center must be finite';
      if (strength === 0 || !Number.isFinite(strength)) return 'strength must be non-zero and finite';
      return pointInPolygon(origin, localPolygon) ? null : 'center must be inside the polygon';
    },
  };
}

/**
 * Opposes motion with force per unit area proportional to the material's
 * velocity. Keep `coefficient / density` well below the tick rate (120) so the
 * explicit step stays stable.
 */
export function dragForce(coefficient: number): FieldForce {
  return {
    kind: 'drag',
    params: { coefficient },
    densityAt: ({ velocity }) => ({ x: -coefficient * velocity.x, y: -coefficient * velocity.y }),
    validate: () => (coefficient > 0 && Number.isFinite(coefficient) ? null : 'coefficient must be positive and finite'),
  };
}
