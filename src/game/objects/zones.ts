import { pointInPolygon, transformPolygon } from '../geometry/polygon';
import { intersectConvexPolygons } from '../geometry/intersection';
import { shapePolygon } from '../geometry/shapes';
import type { ResolvedPiece } from './bodies';
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
