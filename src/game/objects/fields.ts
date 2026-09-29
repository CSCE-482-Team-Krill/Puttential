import { intersectConvexPolygons } from '../geometry/intersection';
import { polygonAreaAndCentroid } from '../geometry/mass';
import { cross, rotateVector, subtract, transformPoint, transformPolygon, triangulateSimplePolygon } from '../geometry/polygon';
import type { ConvexPieceDefinition, FieldZoneDefinition } from '../levels/types';
import type { FieldState, Vec2 } from '../types';

export type FieldLoadBody = Readonly<{
  position: Vec2;
  angle: number;
  centerOfMass: Vec2;
  pieces: readonly ConvexPieceDefinition[];
}>;

export type FieldLoad = Readonly<{ force: Vec2; torque: number }>;
export type FieldInput = Readonly<{ definition: FieldZoneDefinition; state: FieldState }>;
export type PreparedField = FieldInput & Readonly<{
  triangles: readonly (readonly Vec2[])[];
  bounds: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
  sourceWorld: Vec2 | null;
  densityWorld: Vec2 | null;
}>;

export function fieldWorldPolygon(field: FieldZoneDefinition, state: FieldState): Vec2[] {
  return transformPolygon(field.localPolygon, state.position, state.angle);
}

function boundsOf(polygon: readonly Vec2[]): PreparedField['bounds'] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
}

function boundsOverlap(a: PreparedField['bounds'], b: PreparedField['bounds']): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Prepare once per tick so every body shares transformed field geometry. */
export function prepareFields(
  fields: readonly FieldInput[],
  localTriangles?: ReadonlyMap<string, readonly (readonly Vec2[])[]>,
): PreparedField[] {
  return [...fields].sort((a, b) => a.definition.id.localeCompare(b.definition.id))
    .filter((field) => field.state.enabled)
    .map(({ definition, state }) => {
      const local = localTriangles?.get(definition.id) ?? triangulateSimplePolygon(definition.localPolygon);
      const triangles = local.map((triangle) => transformPolygon(triangle, state.position, state.angle));
      const polygon = fieldWorldPolygon(definition, state);
      return {
        definition,
        state,
        triangles,
        bounds: boundsOf(polygon),
        sourceWorld: 'forceDensityLocal' in definition
          ? null : transformPoint(definition.sourceLocal, state.position, state.angle),
        densityWorld: 'forceDensityLocal' in definition
          ? rotateVector(definition.forceDensityLocal, state.angle) : null,
      };
    });
}


function radialLoad(
  overlap: readonly Vec2[],
  source: Vec2,
  strength: number,
  centerOfMass: Vec2,
): FieldLoad {
  let forceX = 0, forceY = 0, torque = 0;
  for (let i = 1; i < overlap.length - 1; i += 1) {
    const a = overlap[0]!, b = overlap[i]!, c = overlap[i + 1]!;
    const area = Math.abs(cross(subtract(b, a), subtract(c, a))) * 0.5;
    if (area <= 0) continue;
    const samples = [
      { x: (4 * a.x + b.x + c.x) / 6, y: (4 * a.y + b.y + c.y) / 6 },
      { x: (a.x + 4 * b.x + c.x) / 6, y: (a.y + 4 * b.y + c.y) / 6 },
      { x: (a.x + b.x + 4 * c.x) / 6, y: (a.y + b.y + 4 * c.y) / 6 },
    ];
    for (const point of samples) {
      const delta = subtract(point, source);
      const scale = strength * area / (3 * Math.sqrt(delta.x * delta.x + delta.y * delta.y + 0.05 ** 2));
      const sampleForce = { x: delta.x * scale, y: delta.y * scale };
      forceX += sampleForce.x;
      forceY += sampleForce.y;
      torque += cross(subtract(point, centerOfMass), sampleForce);
    }
  }
  return { force: { x: forceX, y: forceY }, torque };
}

export function calculateFieldLoad(
  body: FieldLoadBody,
  fields: readonly FieldInput[] | readonly PreparedField[],
): FieldLoad {
  let forceX = 0, forceY = 0, torque = 0;
  const prepared = fields.length > 0 && 'triangles' in fields[0]!
    ? fields as readonly PreparedField[] : prepareFields(fields as readonly FieldInput[]);

  for (const piece of [...body.pieces].sort((a, b) => a.id.localeCompare(b.id))) {
    const pieceWorld = transformPolygon(piece.localPolygon, body.position, body.angle);
    const pieceBounds = boundsOf(pieceWorld);
    for (const field of prepared) {
      if (!boundsOverlap(pieceBounds, field.bounds)) continue;
      for (const triangle of field.triangles) {
        const overlap = intersectConvexPolygons(pieceWorld, triangle);
        if (overlap.length === 0) continue;
        if ((field.definition.kind === 'attractor' || field.definition.kind === 'repulsor') &&
          field.sourceWorld !== null) {
          const sign = field.definition.kind === 'attractor' ? -1 : 1;
          const load = radialLoad(overlap, field.sourceWorld, sign * field.definition.strength, body.centerOfMass);
          forceX += load.force.x;
          forceY += load.force.y;
          torque += load.torque;
        } else {
          const mass = polygonAreaAndCentroid(overlap);
          if (mass === null) continue;
          const density = field.densityWorld!;
          const force = { x: mass.area * density.x, y: mass.area * density.y };
          forceX += force.x;
          forceY += force.y;
          torque += cross(subtract(mass.centroid, body.centerOfMass), force);
        }
      }
    }
  }
  return { force: { x: forceX, y: forceY }, torque };
}
