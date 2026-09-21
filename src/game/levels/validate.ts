import { assertValidConvexPolygon } from '../geometry/polygon';
import type { Vec2 } from '../types';
import type { Level, SurfaceMaterial } from './types';

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertVec2(vector: Vec2, label: string): void {
  assertFinite(vector.x, `${label}.x`);
  assertFinite(vector.y, `${label}.y`);
}

function assertMaterial(material: SurfaceMaterial, label: string): void {
  assertFinite(material.restitution, `${label}.restitution`);
  if (material.restitution < 0 || material.restitution > 1) {
    throw new Error(`${label}.restitution must be between 0 and 1`);
  }
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) throw new Error(`${label} ID must not be empty`);
    if (seen.has(id)) throw new Error(`duplicate ${label} ID: ${id}`);
    seen.add(id);
  }
}

export function validateLevel(level: Level): void {
  if (!level.id) throw new Error('level.id must not be empty');
  if (!Number.isSafeInteger(level.version) || level.version < 1) {
    throw new Error('level.version must be a positive integer');
  }
  assertVec2(level.gravity, 'level.gravity');
  assertUniqueIds(
    [...level.dynamicBodies.map((body) => body.id), ...level.staticBodies.map((body) => body.id)],
    'body',
  );
  assertUniqueIds(level.fields.map((field) => field.id), 'field');

  for (const body of level.dynamicBodies) {
    assertVec2(body.position, `body ${body.id}.position`);
    assertFinite(body.angle, `body ${body.id}.angle`);
    if (body.linearVelocity !== undefined) {
      assertVec2(body.linearVelocity, `body ${body.id}.linearVelocity`);
    }
    if (body.angularVelocity !== undefined) {
      assertFinite(body.angularVelocity, `body ${body.id}.angularVelocity`);
    }
    assertFinite(body.density, `body ${body.id}.density`);
    if (body.density <= 0) throw new Error(`body ${body.id}.density must be positive`);
    assertMaterial(body.material, `body ${body.id}.material`);
    if (body.pieces.length === 0) throw new Error(`body ${body.id} must have at least one piece`);
    assertUniqueIds(body.pieces.map((piece) => piece.id), `piece on body ${body.id}`);
    for (const piece of body.pieces) {
      assertValidConvexPolygon(piece.localPolygon, `body ${body.id} piece ${piece.id}`);
      if (piece.density !== undefined && (!(piece.density > 0) || !Number.isFinite(piece.density))) {
        throw new Error(`body ${body.id} piece ${piece.id}.density must be positive and finite`);
      }
    }
  }

  for (const body of level.staticBodies) {
    assertVec2(body.position, `static body ${body.id}.position`);
    assertFinite(body.angle, `static body ${body.id}.angle`);
    assertMaterial(body.material, `static body ${body.id}.material`);
    if (body.pieces.length === 0) {
      throw new Error(`static body ${body.id} must have at least one piece`);
    }
    assertUniqueIds(body.pieces.map((piece) => piece.id), `piece on static body ${body.id}`);
    for (const piece of body.pieces) {
      assertValidConvexPolygon(piece.localPolygon, `static body ${body.id} piece ${piece.id}`);
    }
  }

  for (const field of level.fields) {
    assertValidConvexPolygon(field.localPolygon, `field ${field.id}`);
    assertVec2(field.position, `field ${field.id}.position`);
    assertFinite(field.angle, `field ${field.id}.angle`);
    assertVec2(field.forceDensityLocal, `field ${field.id}.forceDensityLocal`);
  }

  if (level.prediction !== undefined) {
    if (!Number.isSafeInteger(level.prediction.maxTicks) || level.prediction.maxTicks < 1) {
      throw new Error('level.prediction.maxTicks must be a positive integer');
    }
    if (
      !Number.isSafeInteger(level.prediction.sampleEveryTicks) ||
      level.prediction.sampleEveryTicks < 1
    ) {
      throw new Error('level.prediction.sampleEveryTicks must be a positive integer');
    }
  }
}
