import type { Vec2 } from '../types';
import { GEOMETRY_EPSILON } from './mass';
import { cross, subtract } from './polygon';

function inside(point: Vec2, edgeStart: Vec2, edgeEnd: Vec2): boolean {
  return cross(subtract(edgeEnd, edgeStart), subtract(point, edgeStart)) >= -GEOMETRY_EPSILON;
}

function lineIntersection(
  segmentStart: Vec2,
  segmentEnd: Vec2,
  lineStart: Vec2,
  lineEnd: Vec2,
): Vec2 {
  const segment = subtract(segmentEnd, segmentStart);
  const line = subtract(lineEnd, lineStart);
  const denominator = cross(segment, line);
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) return { ...segmentEnd };
  const t = cross(subtract(lineStart, segmentStart), line) / denominator;
  return {
    x: segmentStart.x + t * segment.x,
    y: segmentStart.y + t * segment.y,
  };
}

function removeAdjacentDuplicates(polygon: readonly Vec2[]): Vec2[] {
  const result: Vec2[] = [];
  for (const point of polygon) {
    const previous = result[result.length - 1];
    if (
      previous === undefined ||
      Math.abs(point.x - previous.x) > GEOMETRY_EPSILON ||
      Math.abs(point.y - previous.y) > GEOMETRY_EPSILON
    ) {
      result.push(point);
    }
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (
    result.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    Math.abs(first.x - last.x) <= GEOMETRY_EPSILON &&
    Math.abs(first.y - last.y) <= GEOMETRY_EPSILON
  ) {
    result.pop();
  }
  return result;
}

/** Clips a convex CCW subject polygon against a convex CCW clip polygon. */
export function intersectConvexPolygons(
  subjectPolygon: readonly Vec2[],
  clipPolygon: readonly Vec2[],
): Vec2[] {
  let output = subjectPolygon.map((point) => ({ ...point }));
  for (let edgeIndex = 0; edgeIndex < clipPolygon.length; edgeIndex += 1) {
    const clipStart = clipPolygon[edgeIndex]!;
    const clipEnd = clipPolygon[(edgeIndex + 1) % clipPolygon.length]!;
    const input = output;
    output = [];
    if (input.length === 0) break;

    let previous = input[input.length - 1]!;
    let previousInside = inside(previous, clipStart, clipEnd);
    for (const current of input) {
      const currentInside = inside(current, clipStart, clipEnd);
      if (currentInside !== previousInside) {
        output.push(lineIntersection(previous, current, clipStart, clipEnd));
      }
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }
    output = removeAdjacentDuplicates(output);
  }
  return output.length >= 3 ? output : [];
}
