import type { FieldShape } from '../levels/types';
import type { Vec2 } from '../types';

/** Sides of the polygon that stands in for a circle when integrating field loads. */
const CIRCLE_OUTLINE_SIDES = 32;

function rectangle(width: number, height: number): Vec2[] {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
}

/** Counter-clockwise local vertices of a polygon or rectangle shape. */
export function shapePolygon(shape: FieldShape): readonly Vec2[] {
  return shape.kind === 'rectangle' ? rectangle(shape.width, shape.height) : shape.points;
}

/**
 * A regular polygon with the same area as the circle, so a uniform field
 * applies the same total force to it. Collisions use the true circle.
 */
export function circleOutline(radius: number): Vec2[] {
  const step = 2 * Math.PI / CIRCLE_OUTLINE_SIDES;
  const outlineRadius = radius * Math.sqrt(step / Math.sin(step));
  return Array.from({ length: CIRCLE_OUTLINE_SIDES }, (_, index) => ({
    x: outlineRadius * Math.cos(index * step),
    y: outlineRadius * Math.sin(index * step),
  }));
}
