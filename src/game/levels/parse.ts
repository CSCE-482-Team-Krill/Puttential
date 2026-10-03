import { assertValidConvexPolygon, assertValidSimplePolygon } from '../geometry/polygon';
import { shapePolygon } from '../geometry/shapes';
import { forceValidationError } from '../objects/forces';
import type { Vec2 } from '../types';
import { LEVEL_FORMAT_VERSION } from './types';
import type {
  ConvexPieceDefinition,
  DynamicBodyDefinition,
  FieldForceDefinition,
  FieldShape,
  FieldZoneDefinition,
  Level,
  LevelGoal,
  PieceShape,
  StaticBodyDefinition,
  SurfaceMaterial,
} from './types';

type JsonObject = Readonly<Record<string, unknown>>;

function asObject(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonObject;
}

/** Rejects unknown properties so a misspelled optional one is not silently ignored. */
function readObject(value: unknown, path: string, keys: readonly string[]): JsonObject {
  const object = asObject(value, path);
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) throw new Error(`${path}.${key} is not a known property`);
  }
  return object;
}

function readArray<T>(value: unknown, path: string, readItem: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((item, index) => readItem(item, `${path}[${index}]`));
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function readPositive(value: unknown, path: string): number {
  const number = readNumber(value, path);
  if (number <= 0) throw new Error(`${path} must be positive`);
  return number;
}

export function assertPositiveInteger(value: unknown, path: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${path} must be a positive integer`);
  }
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

function readId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

const readName = readId;

function readVec2(value: unknown, path: string): Vec2 {
  const object = readObject(value, path, ['x', 'y']);
  return { x: readNumber(object.x, `${path}.x`), y: readNumber(object.y, `${path}.y`) };
}

function readMaterial(value: unknown, path: string): SurfaceMaterial {
  const object = readObject(value, path, ['restitution']);
  const restitution = readNumber(object.restitution, `${path}.restitution`);
  if (restitution < 0 || restitution > 1) throw new Error(`${path}.restitution must be between 0 and 1`);
  return { restitution };
}

function assertUniqueIds(items: readonly Readonly<{ id: string }>[], path: string): void {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) throw new Error(`${path} has a duplicate ID: ${id}`);
    seen.add(id);
  }
}

function readFieldShape(value: unknown, path: string): FieldShape {
  const { kind } = asObject(value, path);
  switch (kind) {
    case 'polygon': {
      const object = readObject(value, path, ['kind', 'points']);
      return { kind, points: readArray(object.points, `${path}.points`, readVec2) };
    }
    case 'rectangle': {
      const object = readObject(value, path, ['kind', 'width', 'height']);
      return {
        kind,
        width: readPositive(object.width, `${path}.width`),
        height: readPositive(object.height, `${path}.height`),
      };
    }
    default:
      throw new Error(`${path}.kind must be "polygon" or "rectangle"`);
  }
}

function readPieceShape(value: unknown, path: string): PieceShape {
  const { kind } = asObject(value, path);
  if (kind === 'circle') {
    const object = readObject(value, path, ['kind', 'radius']);
    return { kind, radius: readPositive(object.radius, `${path}.radius`) };
  }
  if (kind !== 'polygon' && kind !== 'rectangle') {
    throw new Error(`${path}.kind must be "polygon", "rectangle", or "circle"`);
  }
  const shape = readFieldShape(value, path);
  assertValidConvexPolygon(shapePolygon(shape), path);
  return shape;
}

function readPiece(value: unknown, path: string): ConvexPieceDefinition {
  const object = readObject(value, path, ['id', 'shape', 'density']);
  return {
    id: readId(object.id, `${path}.id`),
    shape: readPieceShape(object.shape, `${path}.shape`),
    ...(object.density !== undefined && { density: readPositive(object.density, `${path}.density`) }),
  };
}

function readPieces(value: unknown, path: string): ConvexPieceDefinition[] {
  const pieces = readArray(value, path, readPiece);
  if (pieces.length === 0) throw new Error(`${path} must have at least one piece`);
  assertUniqueIds(pieces, path);
  return pieces;
}

function readDynamicBody(value: unknown, path: string): DynamicBodyDefinition {
  const object = readObject(value, path, [
    'id', 'position', 'angle', 'linearVelocity', 'angularVelocity',
    'density', 'material', 'ccd', 'canSleep', 'pieces',
  ]);
  return {
    id: readId(object.id, `${path}.id`),
    position: readVec2(object.position, `${path}.position`),
    angle: readNumber(object.angle, `${path}.angle`),
    ...(object.linearVelocity !== undefined &&
      { linearVelocity: readVec2(object.linearVelocity, `${path}.linearVelocity`) }),
    ...(object.angularVelocity !== undefined &&
      { angularVelocity: readNumber(object.angularVelocity, `${path}.angularVelocity`) }),
    density: readPositive(object.density, `${path}.density`),
    material: readMaterial(object.material, `${path}.material`),
    ccd: readBoolean(object.ccd, `${path}.ccd`),
    ...(object.canSleep !== undefined && { canSleep: readBoolean(object.canSleep, `${path}.canSleep`) }),
    pieces: readPieces(object.pieces, `${path}.pieces`),
  };
}

function readStaticBody(value: unknown, path: string): StaticBodyDefinition {
  const object = readObject(value, path, ['id', 'position', 'angle', 'material', 'pieces']);
  return {
    id: readId(object.id, `${path}.id`),
    position: readVec2(object.position, `${path}.position`),
    angle: readNumber(object.angle, `${path}.angle`),
    material: readMaterial(object.material, `${path}.material`),
    pieces: readPieces(object.pieces, `${path}.pieces`),
  };
}

function readForce(value: unknown, path: string): FieldForceDefinition {
  const { kind } = asObject(value, path);
  switch (kind) {
    case 'uniform': {
      const object = readObject(value, path, ['kind', 'density']);
      return { kind, density: readVec2(object.density, `${path}.density`) };
    }
    case 'attractor':
    case 'repulsor': {
      const object = readObject(value, path, ['kind', 'source', 'strength']);
      return {
        kind,
        source: readVec2(object.source, `${path}.source`),
        strength: readNumber(object.strength, `${path}.strength`),
      };
    }
    case 'vortex': {
      const object = readObject(value, path, ['kind', 'center', 'strength']);
      return {
        kind,
        center: readVec2(object.center, `${path}.center`),
        strength: readNumber(object.strength, `${path}.strength`),
      };
    }
    case 'drag': {
      const object = readObject(value, path, ['kind', 'coefficient']);
      return { kind, coefficient: readNumber(object.coefficient, `${path}.coefficient`) };
    }
    default:
      throw new Error(`${path}.kind must be "uniform", "attractor", "repulsor", "vortex", or "drag"`);
  }
}

function readField(value: unknown, path: string): FieldZoneDefinition {
  const object = readObject(value, path, ['id', 'shape', 'position', 'angle', 'enabled', 'force']);
  const shape = readFieldShape(object.shape, `${path}.shape`);
  const localPolygon = shapePolygon(shape);
  assertValidSimplePolygon(localPolygon, `${path}.shape`);
  const force = readForce(object.force, `${path}.force`);
  const forceError = forceValidationError(force, localPolygon);
  if (forceError !== null) throw new Error(`${path}.force ${forceError}`);
  return {
    id: readId(object.id, `${path}.id`),
    shape,
    position: readVec2(object.position, `${path}.position`),
    angle: readNumber(object.angle, `${path}.angle`),
    enabled: readBoolean(object.enabled, `${path}.enabled`),
    force,
  };
}

function readGoal(value: unknown, path: string): LevelGoal {
  const object = readObject(value, path, ['bodyId', 'area', 'holdSeconds']);
  const box = readObject(object.area, `${path}.area`, ['minX', 'maxX', 'minY', 'maxY']);
  const area = {
    minX: readNumber(box.minX, `${path}.area.minX`),
    maxX: readNumber(box.maxX, `${path}.area.maxX`),
    minY: readNumber(box.minY, `${path}.area.minY`),
    maxY: readNumber(box.maxY, `${path}.area.maxY`),
  };
  if (area.minX >= area.maxX) throw new Error(`${path}.area.minX must be less than maxX`);
  if (area.minY >= area.maxY) throw new Error(`${path}.area.minY must be less than maxY`);
  const holdSeconds = readNumber(object.holdSeconds, `${path}.holdSeconds`);
  if (holdSeconds < 0) throw new Error(`${path}.holdSeconds must not be negative`);
  return { bodyId: readId(object.bodyId, `${path}.bodyId`), area, holdSeconds };
}

/**
 * Checks untrusted data, such as parsed JSON from a file, a database, or a
 * level editor, and returns it as a `Level`. Throws an error naming the first
 * offending property.
 */
export function parseLevel(data: unknown): Level {
  const object = readObject(data, 'level', [
    'formatVersion', 'id', 'name', 'gravity',
    'dynamicBodies', 'staticBodies', 'fields', 'goal',
  ]);
  if (object.formatVersion !== LEVEL_FORMAT_VERSION) {
    throw new Error(`level.formatVersion must be ${LEVEL_FORMAT_VERSION}`);
  }
  const dynamicBodies = readArray(object.dynamicBodies, 'level.dynamicBodies', readDynamicBody);
  const staticBodies = readArray(object.staticBodies, 'level.staticBodies', readStaticBody);
  const fields = readArray(object.fields, 'level.fields', readField);
  // Bodies and fields share one ID namespace so anything can refer to anything by ID.
  assertUniqueIds([...dynamicBodies, ...staticBodies, ...fields], 'level');
  const goal = readGoal(object.goal, 'level.goal');
  if (!dynamicBodies.some((body) => body.id === goal.bodyId)) {
    throw new Error(`level.goal.bodyId must name a dynamic body: ${goal.bodyId}`);
  }
  return {
    formatVersion: LEVEL_FORMAT_VERSION,
    id: readId(object.id, 'level.id'),
    name: readName(object.name, 'level.name'),
    gravity: readVec2(object.gravity, 'level.gravity'),
    dynamicBodies,
    staticBodies,
    fields,
    goal,
  };
}
