import { intersectConvexPolygons } from '../geometry/intersection';
import { polygonAreaAndCentroid } from '../geometry/mass';
import { cross, rotateVector, subtract, transformPolygon } from '../geometry/polygon';
import type { ConvexPieceDefinition, FieldZoneDefinition } from '../levels/types';
import type { FieldState, Vec2 } from '../types';

export type FieldLoadBody = Readonly<{
  position: Vec2;
  angle: number;
  centerOfMass: Vec2;
  pieces: readonly ConvexPieceDefinition[];
}>;

export type FieldLoad = Readonly<{ force: Vec2; torque: number }>;

export function fieldWorldPolygon(field: FieldZoneDefinition, state: FieldState): Vec2[] {
  return transformPolygon(field.localPolygon, state.position, state.angle);
}

export function calculateFieldLoad(
  body: FieldLoadBody,
  fieldDefinitionsAndStates: readonly Readonly<{
    definition: FieldZoneDefinition;
    state: FieldState;
  }>[],
): FieldLoad {
  let forceX = 0;
  let forceY = 0;
  let torque = 0;

  const pieces = [...body.pieces].sort((a, b) => a.id.localeCompare(b.id));
  const fields = [...fieldDefinitionsAndStates].sort((a, b) =>
    a.definition.id.localeCompare(b.definition.id),
  );
  for (const piece of pieces) {
    const pieceWorld = transformPolygon(piece.localPolygon, body.position, body.angle);
    for (const field of fields) {
      if (!field.state.enabled) continue;
      const fieldPolygon = fieldWorldPolygon(field.definition, field.state);
      const overlap = intersectConvexPolygons(pieceWorld, fieldPolygon);
      const mass = polygonAreaAndCentroid(overlap);
      if (mass === null) continue;

      const density = rotateVector(field.definition.forceDensityLocal, field.state.angle);
      const pieceForce = { x: mass.area * density.x, y: mass.area * density.y };
      forceX += pieceForce.x;
      forceY += pieceForce.y;
      torque += cross(subtract(mass.centroid, body.centerOfMass), pieceForce);
    }
  }
  return { force: { x: forceX, y: forceY }, torque };
}
