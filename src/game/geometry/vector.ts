import type { Vec2 } from '../types';

export const GEOMETRY_EPSILON = 1e-9;

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function transformPoint(point: Vec2, position: Vec2, angle: number): Vec2 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine + position.x,
    y: point.x * sine + point.y * cosine + position.y,
  };
}
