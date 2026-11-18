import type { Vec2 } from '../game';

export type Bounds = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;

/** Affine projection shared by drawing, overlays and pointer input. */
export type View = Readonly<{
  scale: number;
  originX: number;
  originY: number;
  bounds: Bounds;
  quarterTurn: boolean;
}>;

export function toCanvas(view: View, point: Vec2): Vec2 {
  if (view.quarterTurn)
    return {
      x: view.originX + point.y * view.scale,
      y: view.originY + point.x * view.scale,
    };
  return { x: view.originX + point.x * view.scale, y: view.originY - point.y * view.scale };
}

export function toWorld(view: View, point: Vec2): Vec2 {
  if (view.quarterTurn)
    return {
      x: (point.y - view.originY) / view.scale,
      y: (point.x - view.originX) / view.scale,
    };
  return { x: (point.x - view.originX) / view.scale, y: (view.originY - point.y) / view.scale };
}
