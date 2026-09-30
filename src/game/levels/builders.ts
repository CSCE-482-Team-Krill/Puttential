import { rectangle } from '../geometry/polygon';
import type { Vec2 } from '../types';
import type { StaticBodyDefinition, SurfaceMaterial } from './types';

/** Nearly inelastic, so bodies settle against walls instead of bouncing. */
export const lowBounce: SurfaceMaterial = { restitution: 0.01 };

/** A static body with one convex piece. */
export function block(id: string, position: Vec2, localPolygon: readonly Vec2[], angle = 0): StaticBodyDefinition {
  return {
    id,
    position,
    angle,
    material: lowBounce,
    pieces: [{ id: `${id}-piece`, localPolygon }],
  };
}

export function wall(id: string, x: number, y: number, width: number, height: number): StaticBodyDefinition {
  return block(id, { x, y }, rectangle(width, height));
}

/** The standard 14.8 × 8.5 border; its interior spans x ±6.9 and y ±3.75. */
export function arenaWalls(suffix = 'rail'): StaticBodyDefinition[] {
  return [
    wall(`left-${suffix}`, -7.15, 0, 0.5, 8.5),
    wall(`right-${suffix}`, 7.15, 0, 0.5, 8.5),
    wall(`bottom-${suffix}`, 0, -4, 14.8, 0.5),
    wall(`top-${suffix}`, 0, 4, 14.8, 0.5),
  ];
}

/** Counter-clockwise regular polygon with its first vertex at `rotation`. */
export function regularPolygon(radius: number, sides: number, rotation = 0): Vec2[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = index * Math.PI * 2 / sides + rotation;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

export function translatePolygon(polygon: readonly Vec2[], dx: number, dy: number): Vec2[] {
  return polygon.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}
