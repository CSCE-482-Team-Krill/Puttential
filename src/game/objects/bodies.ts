import RAPIER from '@dimforge/rapier2d-compat';
import { transformPolygon } from '../geometry/polygon';
import type { DynamicBodyDefinition, Level, StaticBodyDefinition } from '../levels/types';
import type { RenderStaticBody } from '../types';

function colliderForPolygon(
  polygon: readonly Readonly<{ x: number; y: number }>[],
): RAPIER.ColliderDesc {
  const coordinates = new Float32Array(polygon.length * 2);
  polygon.forEach((point, index) => {
    coordinates[index * 2] = point.x;
    coordinates[index * 2 + 1] = point.y;
  });
  const descriptor = RAPIER.ColliderDesc.convexPolyline(coordinates);
  if (descriptor === null) throw new Error('Rapier could not create a convex polygon collider');
  return descriptor;
}

function configureCollider(
  descriptor: RAPIER.ColliderDesc,
  material: Readonly<{ restitution: number }>,
): RAPIER.ColliderDesc {
  // Ordinary surfaces are frictionless. A future friction field should apply
  // overlap-based drag explicitly instead of relying on contact friction.
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

  for (const piece of [...definition.pieces].sort((a, b) => a.id.localeCompare(b.id))) {
    const collider = configureCollider(
      colliderForPolygon(piece.localPolygon),
      definition.material,
    ).setDensity(piece.density ?? definition.density);
    world.createCollider(collider, body);
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
  for (const piece of [...definition.pieces].sort((a, b) => a.id.localeCompare(b.id))) {
    world.createCollider(configureCollider(colliderForPolygon(piece.localPolygon), definition.material), body);
  }
}

export function buildPhysicsWorld(
  level: Level,
  fixedDt: number,
): Readonly<{ world: RAPIER.World; bodyHandles: Readonly<Record<string, number>> }> {
  const world = new RAPIER.World({ x: level.gravity.x, y: level.gravity.y });
  world.timestep = fixedDt;
  const bodyHandles: Record<string, number> = {};
  for (const body of [...level.dynamicBodies].sort((a, b) => a.id.localeCompare(b.id))) {
    bodyHandles[body.id] = createDynamicBody(world, body);
  }
  for (const body of [...level.staticBodies].sort((a, b) => a.id.localeCompare(b.id))) {
    createStaticBody(world, body);
  }
  return { world, bodyHandles };
}

export function staticRenderBodies(level: Level): readonly RenderStaticBody[] {
  return [...level.staticBodies]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((body) => ({
      id: body.id,
      pieces: [...body.pieces]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((piece) => ({
          id: piece.id,
          worldPolygon: transformPolygon(piece.localPolygon, body.position, body.angle),
        })),
    }));
}
