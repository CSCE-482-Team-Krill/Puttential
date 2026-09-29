import type { Placement, Point, Polygon, PuzzleDefinition } from "./types";

export const PLACEMENT_SCALE = 1024;
export const quantize = (value: number) => Math.round(value * PLACEMENT_SCALE);
export const dequantize = (value: number) => value / PLACEMENT_SCALE;
export const placementPoint = (placement: Placement): Point => ({ x: dequantize(placement.x_q), y: dequantize(placement.y_q) });
export const makePlacement = (tile_id: string, point: Point): Placement => ({ tile_id, x_q: quantize(point.x), y_q: quantize(point.y) });

const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) < 1e-7 && p.x >= Math.min(a.x, b.x) - 1e-7 && p.x <= Math.max(a.x, b.x) + 1e-7 && p.y >= Math.min(a.y, b.y) - 1e-7 && p.y <= Math.max(a.y, b.y) + 1e-7;
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (onSegment(a, b, point)) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function properIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d), cd1 = cross(c, d, a), cd2 = cross(c, d, b);
  return ab1 * ab2 < -1e-8 && cd1 * cd2 < -1e-8;
}
export function polygonInside(inner: Polygon, outer: Polygon): boolean {
  if (inner.length < 3 || outer.length < 3 || inner.some((p) => !pointInPolygon(p, outer))) return false;
  for (let i = 0; i < inner.length; i++) for (let j = 0; j < outer.length; j++) {
    if (properIntersection(inner[i], inner[(i + 1) % inner.length], outer[j], outer[(j + 1) % outer.length])) return false;
  }
  return true;
}
export function isLegalPlacement(puzzle: PuzzleDefinition, placement: Placement): boolean {
  const tile = puzzle.force_tiles.find((item) => item.tile_id === placement.tile_id);
  if (!tile) return false;
  const p = placementPoint(placement);
  return polygonInside(tile.shape.map((vertex) => ({ x: vertex.x + p.x, y: vertex.y + p.y })), puzzle.world.placement_boundary);
}
export function forceCost(puzzle: PuzzleDefinition, placements: Placement[]): number {
  return placements.reduce((sum, placement) => sum + (puzzle.force_tiles.find((tile) => tile.tile_id === placement.tile_id)?.magnitude_mn ?? 0), 0);
}
export const secondsForStep = (step: number) => (step / 120).toFixed(2);
