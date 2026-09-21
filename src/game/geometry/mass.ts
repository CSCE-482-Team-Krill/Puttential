import type { Vec2 } from '../types';

export const GEOMETRY_EPSILON = 1e-9;

export function signedPolygonArea(polygon: readonly Vec2[]): number {
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea * 0.5;
}

export function polygonArea(polygon: readonly Vec2[]): number {
  return Math.abs(signedPolygonArea(polygon));
}

export function polygonCentroid(polygon: readonly Vec2[]): Vec2 | null {
  if (polygon.length < 3) return null;

  let twiceArea = 0;
  let xNumerator = 0;
  let yNumerator = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    xNumerator += (a.x + b.x) * cross;
    yNumerator += (a.y + b.y) * cross;
  }

  if (Math.abs(twiceArea) <= GEOMETRY_EPSILON) return null;
  return {
    x: xNumerator / (3 * twiceArea),
    y: yNumerator / (3 * twiceArea),
  };
}

export function polygonAreaAndCentroid(
  polygon: readonly Vec2[],
): Readonly<{ area: number; centroid: Vec2 }> | null {
  const area = polygonArea(polygon);
  const centroid = polygonCentroid(polygon);
  return area <= GEOMETRY_EPSILON || centroid === null ? null : { area, centroid };
}
