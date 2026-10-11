import type { Vec2 } from '../types';
import { cross, GEOMETRY_EPSILON, subtract, transformPoint } from './vector';

export type Bounds = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;

export function transformPolygon(
  polygon: readonly Vec2[],
  position: Vec2,
  angle: number,
): Vec2[] {
  return polygon.map((point) => transformPoint(point, position, angle));
}

export function signedPolygonArea(polygon: readonly Vec2[]): number {
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    twiceArea += cross(polygon[i]!, polygon[(i + 1) % polygon.length]!);
  }
  return twiceArea * 0.5;
}

export function polygonBounds(points: readonly Vec2[]): Bounds {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return cross(subtract(b, a), subtract(c, a));
}

function onSegment(a: Vec2, b: Vec2, point: Vec2): boolean {
  return (
    point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON &&
    point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON &&
    point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON &&
    point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON
  );
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (
    ((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) ||
      (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON)) &&
    ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) ||
      (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))
  ) {
    return true;
  }

  return (
    (Math.abs(abC) <= GEOMETRY_EPSILON && onSegment(a, b, c)) ||
    (Math.abs(abD) <= GEOMETRY_EPSILON && onSegment(a, b, d)) ||
    (Math.abs(cdA) <= GEOMETRY_EPSILON && onSegment(c, d, a)) ||
    (Math.abs(cdB) <= GEOMETRY_EPSILON && onSegment(c, d, b))
  );
}

/** Accepts either winding, including concave polygons, but rejects holes and crossings. */
function simplePolygonValidationError(polygon: readonly Vec2[]): string | null {
  if (polygon.length < 3) return 'must have at least three vertices';
  if (polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return 'contains a non-finite coordinate';
  }
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) <= GEOMETRY_EPSILON) {
      return 'contains a zero-length edge';
    }
    for (let j = i + 1; j < polygon.length; j += 1) {
      if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue;
      if (segmentsIntersect(a, b, polygon[j]!, polygon[(j + 1) % polygon.length]!)) {
        return 'is self-intersecting';
      }
    }
  }
  if (Math.abs(signedPolygonArea(polygon)) <= GEOMETRY_EPSILON) return 'has zero area';
  return null;
}

function convexPolygonValidationError(polygon: readonly Vec2[]): string | null {
  const error = simplePolygonValidationError(polygon);
  if (error !== null) return error;
  if (signedPolygonArea(polygon) < 0) return 'must use counter-clockwise winding';
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const c = polygon[(i + 2) % polygon.length]!;
    if (orientation(a, b, c) < -GEOMETRY_EPSILON) return 'must be convex';
  }
  return null;
}

export function assertValidSimplePolygon(polygon: readonly Vec2[], label = 'polygon'): void {
  const error = simplePolygonValidationError(polygon);
  if (error !== null) throw new Error(`${label} ${error}`);
}

export function assertValidConvexPolygon(polygon: readonly Vec2[], label = 'polygon'): void {
  const error = convexPolygonValidationError(polygon);
  if (error !== null) throw new Error(`${label} ${error}`);
}

/** A boundary point counts as inside. The polygon must be simple. */
export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    if (Math.abs(orientation(a, b, point)) <= GEOMETRY_EPSILON && onSegment(a, b, point)) {
      return true;
    }
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInTriangle(point: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  return orientation(a, b, point) >= -GEOMETRY_EPSILON &&
    orientation(b, c, point) >= -GEOMETRY_EPSILON &&
    orientation(c, a, point) >= -GEOMETRY_EPSILON;
}

/** Deterministic ear clipping. Output triangles are counter-clockwise. */
export function triangulateSimplePolygon(polygon: readonly Vec2[]): Vec2[][] {
  assertValidSimplePolygon(polygon);
  const points = signedPolygonArea(polygon) > 0 ? [...polygon] : [...polygon].reverse();
  const indices = points.map((_, index) => index);
  const triangles: Vec2[][] = [];
  while (indices.length > 3) {
    let earFound = false;
    for (let i = 0; i < indices.length; i += 1) {
      const previous = points[indices[(i + indices.length - 1) % indices.length]!]!;
      const current = points[indices[i]!]!;
      const next = points[indices[(i + 1) % indices.length]!]!;
      const turn = orientation(previous, current, next);
      if (Math.abs(turn) <= GEOMETRY_EPSILON) {
        indices.splice(i, 1);
        earFound = true;
        break;
      }
      if (turn < 0) continue;
      if (indices.some((index) => {
        const point = points[index]!;
        return point !== previous && point !== current && point !== next &&
          pointInTriangle(point, previous, current, next);
      })) continue;
      triangles.push([previous, current, next]);
      indices.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) throw new Error('polygon could not be triangulated');
  }
  triangles.push(indices.map((index) => points[index]!));
  return triangles;
}
