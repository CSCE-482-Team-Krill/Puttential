import { intersectConvexPolygons } from '../geometry/intersection';
import { boundsOverlap, polygonBounds, transformPolygon } from '../geometry/polygon';
import type { Bounds } from '../geometry/polygon';
import { shapePolygon } from '../geometry/shapes';
import { cross, subtract } from '../geometry/vector';
import type { FieldZoneDefinition, PieceShape } from '../levels/types';
import type { FieldState, Vec2 } from '../types';
import type { ForceDensity } from './forces';

export type FieldLoadBody = Readonly<{
  position: Vec2;
  angle: number;
  centerOfMass: Vec2;
  linearVelocity: Vec2;
  angularVelocity: number;
  pieces: readonly Readonly<{ shape: PieceShape; outline: readonly Vec2[]; density: number }>[];
}>;

export type FieldLoad = Readonly<{ force: Vec2; torque: number }>;

/** World-space field geometry, prepared once and shared by every body. */
export type PreparedField = Readonly<{
  densityAt: ForceDensity;
  position: Vec2;
  cos: number;
  sin: number;
  triangles: readonly (readonly Vec2[])[];
  bounds: Bounds;
}>;

type Accumulator = { forceX: number; forceY: number; torque: number };

export function fieldWorldPolygon(field: FieldZoneDefinition, state: FieldState): Vec2[] {
  return transformPolygon(shapePolygon(field.shape), state.position, state.angle);
}

/** `localTriangles` is the field polygon's triangulation in its local frame. */
export function prepareField(
  densityAt: ForceDensity,
  state: FieldState,
  localTriangles: readonly (readonly Vec2[])[],
): PreparedField {
  const triangles = localTriangles.map((triangle) =>
    transformPolygon(triangle, state.position, state.angle));
  return {
    densityAt,
    position: state.position,
    cos: Math.cos(state.angle),
    sin: Math.sin(state.angle),
    triangles,
    bounds: polygonBounds(triangles.flat()),
  };
}

/** Evaluates the field at one world point and adds `weight` times its load. */
function addSample(
  total: Accumulator,
  field: PreparedField,
  body: FieldLoadBody,
  density: number,
  point: Vec2,
  weight: number,
): void {
  const { cos, sin } = field;
  const arm = subtract(point, body.centerOfMass);
  const velocityX = body.linearVelocity.x - body.angularVelocity * arm.y;
  const velocityY = body.linearVelocity.y + body.angularVelocity * arm.x;
  const offsetX = point.x - field.position.x;
  const offsetY = point.y - field.position.y;
  const local = field.densityAt({
    point: { x: offsetX * cos + offsetY * sin, y: -offsetX * sin + offsetY * cos },
    velocity: { x: velocityX * cos + velocityY * sin, y: -velocityX * sin + velocityY * cos },
    density,
  });
  const force = {
    x: weight * (local.x * cos - local.y * sin),
    y: weight * (local.x * sin + local.y * cos),
  };
  total.forceX += force.x;
  total.forceY += force.y;
  total.torque += cross(arm, force);
}

/**
 * Integrates each field over its overlap with the body using a three-point
 * rule per overlap triangle, which is exact for constant and linear forces.
 */
export function calculateFieldLoad(
  body: FieldLoadBody,
  fields: readonly PreparedField[],
): FieldLoad {
  const total: Accumulator = { forceX: 0, forceY: 0, torque: 0 };
  for (const piece of body.pieces) {
    // A circle's outline stays unrotated so its load does not depend on the body's spin.
    const angle = piece.shape.kind === 'circle' ? 0 : body.angle;
    const pieceWorld = transformPolygon(piece.outline, body.position, angle);
    const pieceBounds = polygonBounds(pieceWorld);
    for (const field of fields) {
      if (!boundsOverlap(pieceBounds, field.bounds)) continue;
      for (const triangle of field.triangles) {
        const overlap = intersectConvexPolygons(pieceWorld, triangle);
        for (let i = 1; i < overlap.length - 1; i += 1) {
          const a = overlap[0]!, b = overlap[i]!, c = overlap[i + 1]!;
          const area = Math.abs(cross(subtract(b, a), subtract(c, a))) * 0.5;
          if (area <= 0) continue;
          const weight = area / 3;
          addSample(total, field, body, piece.density,
            { x: (4 * a.x + b.x + c.x) / 6, y: (4 * a.y + b.y + c.y) / 6 }, weight);
          addSample(total, field, body, piece.density,
            { x: (a.x + 4 * b.x + c.x) / 6, y: (a.y + 4 * b.y + c.y) / 6 }, weight);
          addSample(total, field, body, piece.density,
            { x: (a.x + b.x + 4 * c.x) / 6, y: (a.y + b.y + 4 * c.y) / 6 }, weight);
        }
      }
    }
  }
  return { force: { x: total.forceX, y: total.forceY }, torque: total.torque };
}
