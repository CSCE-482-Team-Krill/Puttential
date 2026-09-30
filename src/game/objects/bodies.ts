import RAPIER from '@dimforge/rapier2d-compat';
import { transformPolygon } from '../geometry/polygon';
import { sortById } from '../ids';
import type { DynamicBodyDefinition, Level, StaticBodyDefinition, SurfaceMaterial } from '../levels/types';
import type { RenderStaticBody, Vec2 } from '../types';

/** A body piece with its effective density, in stable ID order. */
export type ResolvedPiece = Readonly<{ id: string; localPolygon: readonly Vec2[]; density: number }>;

export function resolvePieces(body: DynamicBodyDefinition): ResolvedPiece[] {
  return sortById(body.pieces).map((piece) => ({
    id: piece.id,
    localPolygon: piece.localPolygon,
    density: piece.density ?? body.density,
  }));
}

function colliderForPolygon(polygon: readonly Vec2[], material: SurfaceMaterial): RAPIER.ColliderDesc {
  const coordinates = new Float32Array(polygon.flatMap((point) => [point.x, point.y]));
  const descriptor = RAPIER.ColliderDesc.convexPolyline(coordinates);
  if (descriptor === null) throw new Error('Rapier could not create a convex polygon collider');
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
    .setCcdEnabled(definition.ccd)
    .setUserData({ gameBodyId: definition.id });
  const body = world.createRigidBody(descriptor);
  for (const piece of resolvePieces(definition)) {
    world.createCollider(
      colliderForPolygon(piece.localPolygon, definition.material).setDensity(piece.density),
      body,
    );
  }
  return body.handle;
}

function createStaticBody(world: RAPIER.World, definition: StaticBodyDefinition): void {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(definition.position.x, definition.position.y)
      .setRotation(definition.angle)
      .setUserData({ gameBodyId: definition.id }),
  );
  for (const piece of sortById(definition.pieces)) {
    world.createCollider(colliderForPolygon(piece.localPolygon, definition.material), body);
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
    pieces: sortById(body.pieces).map((piece) => ({
      id: piece.id,
      worldPolygon: transformPolygon(piece.localPolygon, body.position, body.angle),
    })),
  }));
}
