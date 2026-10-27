import { pointInPolygon, transformPolygon } from '../geometry/polygon';
import { intersectConvexPolygons } from '../geometry/intersection';
import { shapePolygon } from '../geometry/shapes';
import type { ResolvedPiece } from './bodies';
import { cross, subtract, GEOMETRY_EPSILON } from '../geometry/vector';
import type { Vec2 } from '../types';

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Exact circle containment, including concave shoreline edges; polygons use clipped area. */
export function zoneContact(
  pieces: readonly ResolvedPiece[],
  position: Vec2,
  angle: number,
  polygon: readonly Vec2[],
  triangles: readonly (readonly Vec2[])[],
) {
  let touching = false,
    submerged = true;
  for (const piece of pieces) {
    if (piece.shape.kind === 'circle') {
      const inside = pointInPolygon(position, polygon);
      const edgeDistance = Math.min(
        ...polygon.map((p, i) =>
          distanceToSegment(position, p, polygon[(i + 1) % polygon.length]!),
        ),
      );
      touching ||= inside || edgeDistance <= piece.shape.radius + 1e-8;
      submerged &&= inside && edgeDistance >= piece.shape.radius - 1e-8;
    } else {
      const points = transformPolygon(shapePolygon(piece.shape), position, angle);
      const area = (p: readonly Vec2[]) =>
        Math.abs(
          p.reduce((sum, a, i) => {
            const b = p[(i + 1) % p.length]!;
            return sum + a.x * b.y - b.x * a.y;
          }, 0),
        ) / 2;
      const overlap = triangles.reduce(
        (sum, triangle) => sum + area(intersectConvexPolygons(points, triangle)),
        0,
      );
      touching ||= overlap > 1e-10;
      submerged &&= overlap >= area(points) - 1e-8;
    }
  }
  return { touching, submerged };
}

/** Earliest center entry, including fast crossings of thin, rotated or concave zones. */
export function centerZoneEntry(start: Vec2, end: Vec2, polygon: readonly Vec2[]): number | null {
  if (pointInPolygon(start, polygon)) return 0;
  const movement = subtract(end, start);
  const movementLength = Math.hypot(movement.x, movement.y);
  if (movementLength === 0) return null;
  let first = pointInPolygon(end, polygon) ? 1 : Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    const edge = subtract(b, a),
      offset = subtract(a, start);
    const denominator = cross(movement, edge);
    const parallelTolerance = Number.EPSILON * movementLength * Math.hypot(edge.x, edge.y) * 8;
    if (Math.abs(denominator) <= parallelTolerance) {
      // A center moving along the boundary enters at its first endpoint.
      if (Math.abs(cross(offset, movement)) > GEOMETRY_EPSILON * movementLength) continue;
      const lengthSquared = movement.x ** 2 + movement.y ** 2;
      const ta = (offset.x * movement.x + offset.y * movement.y) / lengthSquared;
      const ob = subtract(b, start);
      const tb = (ob.x * movement.x + ob.y * movement.y) / lengthSquared;
      const entry = Math.max(0, Math.min(ta, tb)),
        exit = Math.min(1, Math.max(ta, tb));
      if (entry <= exit) first = Math.min(first, entry);
      continue;
    }
    const t = cross(offset, edge) / denominator,
      u = cross(offset, movement) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) first = Math.min(first, t);
  }
  return Number.isFinite(first) ? first : null;
}
