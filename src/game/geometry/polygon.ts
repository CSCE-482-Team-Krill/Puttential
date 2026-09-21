import type { Vec2 } from '../types';
import { GEOMETRY_EPSILON, signedPolygonArea } from './mass';

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function rotateVector(vector: Vec2, angle: number): Vec2 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

export function transformPoint(point: Vec2, position: Vec2, angle: number): Vec2 {
  const rotated = rotateVector(point, angle);
  return { x: rotated.x + position.x, y: rotated.y + position.y };
}

export function transformPolygon(
  polygon: readonly Vec2[],
  position: Vec2,
  angle: number,
): Vec2[] {
  return polygon.map((point) => transformPoint(point, position, angle));
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

export function convexPolygonValidationError(polygon: readonly Vec2[]): string | null {
  if (polygon.length < 3) return 'must have at least three vertices';
  if (polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return 'contains a non-finite coordinate';
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const edge = subtract(polygon[(i + 1) % polygon.length]!, polygon[i]!);
    if (Math.hypot(edge.x, edge.y) <= GEOMETRY_EPSILON) {
      return 'contains a zero-length edge';
    }
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    for (let j = i + 1; j < polygon.length; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === polygon.length - 1);
      if (adjacent) continue;
      const c = polygon[j]!;
      const d = polygon[(j + 1) % polygon.length]!;
      if (segmentsIntersect(a, b, c, d)) return 'is self-intersecting';
    }
  }

  const area = signedPolygonArea(polygon);
  if (Math.abs(area) <= GEOMETRY_EPSILON) return 'has zero area';
  if (area < 0) return 'must use counter-clockwise winding';

  let hasPositiveTurn = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const c = polygon[(i + 2) % polygon.length]!;
    const turn = orientation(a, b, c);
    if (turn < -GEOMETRY_EPSILON) return 'must be convex';
    if (turn > GEOMETRY_EPSILON) hasPositiveTurn = true;
  }
  return hasPositiveTurn ? null : 'has zero area';
}

export function assertValidConvexPolygon(
  polygon: readonly Vec2[],
  label = 'polygon',
): void {
  const error = convexPolygonValidationError(polygon);
  if (error !== null) throw new Error(`${label} ${error}`);
}

export function rectangle(width: number, height: number): Vec2[] {
  if (!(width > 0) || !(height > 0)) throw new Error('rectangle dimensions must be positive');
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
}
