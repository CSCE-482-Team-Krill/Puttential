import RAPIER from '@dimforge/rapier2d-compat';
import { transformPolygon } from '../geometry/polygon';
import { circleOutline, shapePolygon } from '../geometry/shapes';
import { sortById } from '../ids';
import type {
  ConvexPieceDefinition,
  DynamicBodyDefinition,
  Level,
  PieceShape,
  StaticBodyDefinition,
  SurfaceMaterial,
} from '../levels/types';
import type { RenderPiece, RenderStaticBody, Vec2 } from '../types';

/**
 * A body piece with its effective density, in stable ID order. `outline` is
 * the piece's local polygon; for a circle it is an equal-area approximation
 * used only to integrate field loads.
 */
export type ResolvedPiece = Readonly<{
  id: string;
  shape: PieceShape;
  outline: readonly Vec2[];
  density: number;
}>;

function resolvePieces(pieces: readonly ConvexPieceDefinition[], bodyDensity: number): ResolvedPiece[] {
  return sortById(pieces).map((piece) => ({
    id: piece.id,
    shape: piece.shape,
    outline: piece.shape.kind === 'circle' ? circleOutline(piece.shape.radius) : shapePolygon(piece.shape),
    density: piece.density ?? bodyDensity,
  }));
}

export function resolveBodyPieces(body: DynamicBodyDefinition): ResolvedPiece[] {
  return resolvePieces(body.pieces, body.density);
}

export function renderPiece(piece: ResolvedPiece, position: Vec2, angle: number): RenderPiece {
  if (piece.shape.kind === 'circle') {
    return { id: piece.id, kind: 'circle', center: { x: position.x, y: position.y }, radius: piece.shape.radius };
  }
  return { id: piece.id, kind: 'polygon', worldPolygon: transformPolygon(piece.outline, position, angle) };
}

function colliderForPiece(piece: ResolvedPiece, material: SurfaceMaterial): RAPIER.ColliderDesc {
  let descriptor: RAPIER.ColliderDesc | null;
  if (piece.shape.kind === 'circle') {
    descriptor = RAPIER.ColliderDesc.ball(piece.shape.radius);
  } else {
    const coordinates = new Float32Array(piece.outline.flatMap((point) => [point.x, point.y]));
    descriptor = RAPIER.ColliderDesc.convexPolyline(coordinates);
    if (descriptor === null) throw new Error('Rapier could not create a convex polygon collider');
  }
  // Ordinary surfaces are frictionless. Drag belongs to fields, which apply it
  // from overlap instead of relying on contact friction.
  return descriptor.setFriction(0).setRestitution(material.restitution);
}

function createDynamicBody(world: RAPIER.World, definition: DynamicBodyDefinition): number {
  const velocity = definition.linearVelocity ?? { x: 0, y: 0 };
  const descriptor = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(definition.position.x, definition.position.y)
    .setRotation(definition.angle)
    .setLinvel(velocity.x, velocity.y)
    .setAngvel(definition.angularVelocity ?? 0)
    .setLinearDamping(0)
    .setAngularDamping(0)
    .setCanSleep(definition.canSleep ?? true)
    .setCcdEnabled(definition.ccd);
  const body = world.createRigidBody(descriptor);
  for (const piece of resolveBodyPieces(definition)) {
    world.createCollider(colliderForPiece(piece, definition.material).setDensity(piece.density), body);
  }
  return body.handle;
}

function createStaticBody(world: RAPIER.World, definition: StaticBodyDefinition): void {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(definition.position.x, definition.position.y)
      .setRotation(definition.angle),
  );
  for (const piece of resolvePieces(definition.pieces, 1)) {
    world.createCollider(colliderForPiece(piece, definition.material), body);
  }
}

export function buildPhysicsWorld(
  level: Level,
  fixedDt: number,
): Readonly<{ world: RAPIER.World; bodyHandles: Readonly<Record<string, number>> }> {
  const world = new RAPIER.World({ x: level.gravity.x, y: level.gravity.y });
  world.timestep = fixedDt;
  const bodyHandles: Record<string, number> = {};
  for (const body of sortById(level.dynamicBodies)) {
    bodyHandles[body.id] = createDynamicBody(world, body);
  }
  for (const body of sortById(level.staticBodies)) {
    createStaticBody(world, body);
  }
  return { world, bodyHandles };
}

export function staticRenderBodies(level: Level): readonly RenderStaticBody[] {
  return sortById(level.staticBodies).map((body) => ({
    id: body.id,
    pieces: resolvePieces(body.pieces, 1).map((piece) => renderPiece(piece, body.position, body.angle)),
  }));
}
