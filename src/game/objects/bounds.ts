import { transformPolygon } from '../geometry/polygon';
import type { Bounds } from '../geometry/polygon';
import type { Vec2 } from '../types';
import type { ResolvedPiece } from './bodies';

// Rapier stores positions as float32; tangency must not fail because of round-off.
const EPSILON = 1e-6;

/** Convex polygon/board SAT includes edge contact; an AABB alone is insufficient at corners. */
function polygonTouchesBounds(polygon: readonly Vec2[], bounds: Bounds): boolean {
  if (
    polygon.some(
      (p) =>
        p.x >= bounds.minX - EPSILON &&
        p.x <= bounds.maxX + EPSILON &&
        p.y >= bounds.minY - EPSILON &&
        p.y <= bounds.maxY + EPSILON,
    )
  )
    return true;
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    ...polygon.map((a, i) => {
      const b = polygon[(i + 1) % polygon.length]!,
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      return { x: -dy / length, y: dx / length };
    }),
  ];
  return axes.every((axis) => {
    const piece = polygon.map((p) => p.x * axis.x + p.y * axis.y);
    const board = corners.map((p) => p.x * axis.x + p.y * axis.y);
    return (
      Math.max(...piece) >= Math.min(...board) - EPSILON &&
      Math.min(...piece) <= Math.max(...board) + EPSILON
    );
  });
}

/** A compound body remains in play while any actual piece touches the playable area. */
export function bodyTouchesBounds(
  pieces: readonly ResolvedPiece[],
  position: Vec2,
  angle: number,
  bounds: Bounds,
): boolean {
  return pieces.some((piece) => {
    if (piece.shape.kind === 'circle') {
      const dx = position.x - Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
      const dy = position.y - Math.max(bounds.minY, Math.min(bounds.maxY, position.y));
      return Math.hypot(dx, dy) <= piece.shape.radius + EPSILON;
    }
    return polygonTouchesBounds(transformPolygon(piece.outline, position, angle), bounds);
  });
}
