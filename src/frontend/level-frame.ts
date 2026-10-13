import { transformPolygon, shapePolygon } from '../game';
import type { Level, RenderState } from '../game';
import { renderPiece, resolveBodyPieces, staticRenderBodies } from '../game/objects/bodies';
/** Static authoring data uses the engine's renderer helpers; all movement uses createGame. */
export function levelFrame(level: Level): RenderState {
  return {
    tick: 0,
    bodies: level.dynamicBodies.map((body) => ({
      id: body.id,
      position: body.position,
      angle: body.angle,
      linearVelocity: body.linearVelocity ?? { x: 0, y: 0 },
      angularVelocity: body.angularVelocity ?? 0,
      sleeping: false,
      pieces: resolveBodyPieces(body).map((piece) => renderPiece(piece, body.position, body.angle)),
    })),
    staticBodies: staticRenderBodies(level),
    fields: level.fields.map((field) => ({
      id: field.id,
      position: field.position,
      angle: field.angle,
      enabled: field.enabled,
      force: field.force,
      worldPolygon: transformPolygon(shapePolygon(field.shape), field.position, field.angle),
    })),
  };
}
