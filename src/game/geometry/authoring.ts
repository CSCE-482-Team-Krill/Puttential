import { polygonBounds, transformPolygon } from './polygon';
import { shapePolygon } from './shapes';
import type { Bounds } from './polygon';
import type { PieceShape } from '../levels/types';
import type { Vec2 } from '../types';

export const rectangle = (width: number, height: number): Vec2[] => [
  ...shapePolygon({ kind: 'rectangle', width, height }),
];
/** Display/selection outline only. Circle physics uses the upstream ball collider. */
export function shapeOutline(shape: PieceShape): Vec2[] {
  return shape.kind === 'circle'
    ? Array.from({ length: 64 }, (_, i) => ({
        x: shape.radius * Math.cos((i * Math.PI) / 32),
        y: shape.radius * Math.sin((i * Math.PI) / 32),
      }))
    : [...shapePolygon(shape)];
}
export function shapeBounds(shape: PieceShape, position: Vec2 = { x: 0, y: 0 }, angle = 0): Bounds {
  return shape.kind === 'circle'
    ? {
        minX: position.x - shape.radius,
        maxX: position.x + shape.radius,
        minY: position.y - shape.radius,
        maxY: position.y + shape.radius,
      }
    : polygonBounds(transformPolygon(shapePolygon(shape), position, angle));
}
export function unionBounds(bounds: readonly Bounds[]): Bounds {
  return {
    minX: Math.min(...bounds.map((b) => b.minX)),
    maxX: Math.max(...bounds.map((b) => b.maxX)),
    minY: Math.min(...bounds.map((b) => b.minY)),
    maxY: Math.max(...bounds.map((b) => b.maxY)),
  };
}
