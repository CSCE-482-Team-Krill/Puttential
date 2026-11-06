import type { LevelDocument } from '../game/levels/codec';
import type { PieceShape } from '../game/levels/types';
import { validateDocument } from '../game/levels/document';
import { shapePolygon } from '../game/geometry/shapes';
import { signedPolygonArea, triangulateSimplePolygon } from '../game/geometry/polygon';
import { canonicalJson } from './community-canonical-json';
import { decodeStrictJson, utf8Length } from './strict-json';

export const COMMUNITY_PROFILE = 'community-v1';
export type ProfileIssue = { code: string; path: string; expected: string };
export class CommunityProfileError extends Error {
  constructor(public issues: readonly ProfileIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.expected}`).join('; '));
    this.name = 'CommunityProfileError';
  }
}
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
type ObjectValue = Record<string, unknown>;

/** Linear structural checks only. Do not call engine codecs/geometric algorithms in web saves. */
export function validateCommunityStructure(input: unknown): LevelDocument {
  // Also protects object-valued imports from undefined/NaN/prototype/Unicode surprises.
  const wire = canonicalJson(input);
  if (utf8Length(wire) > 256 * 1024)
    throw new CommunityProfileError([
      { code: 'SIZE', path: 'document', expected: 'at most 256 KiB' },
    ]);
  const value = decodeStrictJson(new TextEncoder().encode(wire));
  const issues: ProfileIssue[] = [];
  const add = (code: string, path: string, expected: string) => {
    issues.push({ code, path, expected });
  };
  const object = (v: unknown, path: string, keys: readonly string[]): ObjectValue => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      add('TYPE', path, 'an object');
      return {};
    }
    const result = v as ObjectValue;
    for (const key of Object.keys(result))
      if (!keys.includes(key)) add('UNKNOWN', `${path}.${key}`, 'no unknown properties');
    return result;
  };
  const range = (v: unknown, min: number, max: number, path: string, integer = false) => {
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < min ||
      v > max ||
      (integer && !Number.isSafeInteger(v))
    )
      add('RANGE', path, `${integer ? 'integer ' : ''}in [${min}, ${max}]`);
  };
  const literal = (v: unknown, expected: unknown, path: string) => {
    if (v !== expected) add('VALUE', path, `must equal ${String(expected)}`);
  };
  const boolean = (v: unknown, path: string) => {
    if (typeof v !== 'boolean') add('TYPE', path, 'a boolean');
  };
  const id = (v: unknown, path: string) => {
    if (typeof v !== 'string' || !ID.test(v) || RESERVED.has(v))
      add('ID', path, '1–80 lowercase ASCII letters, digits or hyphens; no reserved IDs');
  };
  const array = (v: unknown, path: string, min: number, max: number): unknown[] => {
    if (!Array.isArray(v)) {
      add('TYPE', path, 'an array');
      return [];
    }
    range(v.length, min, max, `${path}.length`, true);
    return v.length > max ? [] : v;
  };
  const vector = (v: unknown, path: string, component: number, magnitude?: number) => {
    const point = object(v, path, ['x', 'y']);
    range(point.x, -component, component, `${path}.x`);
    range(point.y, -component, component, `${path}.y`);
    if (
      magnitude !== undefined &&
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      Math.hypot(point.x, point.y) > magnitude
    )
      add('MAGNITUDE', path, `magnitude at most ${magnitude}`);
  };
  const bounds = (v: unknown, path: string, board: boolean) => {
    const box = object(v, path, ['minX', 'maxX', 'minY', 'maxY']);
    for (const key of ['minX', 'maxX', 'minY', 'maxY'])
      range(box[key], -1000, 1000, `${path}.${key}`);
    range(Number(box.maxX) - Number(box.minX), board ? 2 : 0.05, 100, `${path}.width`);
    range(Number(box.maxY) - Number(box.minY), board ? 2 : 0.05, 100, `${path}.height`);
    return box;
  };
  let vertices = 0,
    pieces = 0;
  const shape = (v: unknown, path: string, field: boolean) => {
    const raw = v as ObjectValue | null;
    if (raw?.kind === 'rectangle') {
      const s = object(v, path, ['kind', 'width', 'height']);
      range(s.width, 0.05, 100, `${path}.width`);
      range(s.height, 0.05, 100, `${path}.height`);
      vertices += 4;
    } else if (raw?.kind === 'circle' && !field) {
      const s = object(v, path, ['kind', 'radius']);
      range(s.radius, 0.025, 50, `${path}.radius`);
    } else if (raw?.kind === 'polygon') {
      const s = object(v, path, ['kind', 'points']);
      const points = array(s.points, `${path}.points`, 3, 64);
      vertices += points.length;
      points.forEach((point, i) => vector(point, `${path}.points[${i}]`, 100));
    } else
      add('SHAPE', `${path}.kind`, field ? 'rectangle or polygon' : 'rectangle, circle or polygon');
  };
  const raw = value as ObjectValue | null;
  const engineOnly = raw !== null && typeof raw === 'object' && 'formatVersion' in raw;
  const root = engineOnly ? null : object(value, 'document', ['version', 'level', 'editor']);
  if (root) literal(root.version, 2, 'document.version');
  const level = object(engineOnly ? value : root?.level, 'level', [
    'formatVersion',
    'id',
    'version',
    'gravity',
    'bounds',
    'dynamicBodies',
    'staticBodies',
    'fields',
    'goal',
    'prediction',
  ]);
  literal(level.formatVersion, 1, 'level.formatVersion');
  id(level.id, 'level.id');
  range(level.version, 1, Number.MAX_SAFE_INTEGER, 'level.version', true);
  vector(level.gravity, 'level.gravity', 20, 20);
  let arenaBounds: ObjectValue;
  let editor: ObjectValue;
  if (root) {
    editor = object(root.editor, 'editor', ['name', 'arena']);
    if (typeof editor.name !== 'string' || !editor.name.trim())
      add('TEXT', 'editor.name', 'a nonempty name');
    const arena = object(editor.arena, 'editor.arena', ['bounds', 'walls', 'thickness']);
    arenaBounds = bounds(arena.bounds, 'editor.arena.bounds', true);
    range(arena.thickness, 0.05, 5, 'editor.arena.thickness');
    const walls = array(arena.walls, 'editor.arena.walls', 0, 4);
    if (walls.length !== 0 && walls.length !== 4)
      add('WALLS', 'editor.arena.walls', 'zero or four distinct static IDs');
    if (new Set(walls).size !== walls.length)
      add('DUPLICATE_ID', 'editor.arena.walls', 'distinct wall IDs');
    walls.forEach((wall, i) => id(wall, `editor.arena.walls[${i}]`));
  } else {
    arenaBounds = bounds(level.bounds, 'level.bounds', true);
    editor = { name: level.id, arena: { bounds: arenaBounds, walls: [], thickness: 0.5 } };
  }
  if (level.bounds !== undefined) {
    const engineBounds = bounds(level.bounds, 'level.bounds', true);
    if (['minX', 'maxX', 'minY', 'maxY'].some((key) => engineBounds[key] !== arenaBounds[key]))
      add('BOUNDS', 'level.bounds', 'exactly equal to editor arena bounds');
  }
  const seen = new Set<unknown>();
  for (const [category, min, max] of [
    ['dynamicBodies', 1, 16],
    ['staticBodies', 0, 128],
  ] as const) {
    array(level[category], `level.${category}`, min, max).forEach((item, i) => {
      const path = `level.${category}[${i}]`;
      const dynamic = category === 'dynamicBodies';
      const body = object(item, path, [
        'id',
        'position',
        'angle',
        'material',
        'pieces',
        ...(dynamic ? ['density', 'ccd', 'linearVelocity', 'angularVelocity', 'canSleep'] : []),
      ]);
      id(body.id, `${path}.id`);
      if (seen.has(body.id)) add('DUPLICATE_ID', `${path}.id`, 'unique body/field ID');
      seen.add(body.id);
      vector(body.position, `${path}.position`, 1000);
      range(body.angle, -100 * Math.PI, 100 * Math.PI, `${path}.angle`);
      const material = object(body.material, `${path}.material`, ['restitution']);
      range(material.restitution, 0, 1, `${path}.material.restitution`);
      if (dynamic) {
        range(body.density, 0.1, 20, `${path}.density`);
        boolean(body.ccd, `${path}.ccd`);
        if (body.canSleep !== undefined) boolean(body.canSleep, `${path}.canSleep`);
        if (body.linearVelocity !== undefined)
          vector(body.linearVelocity, `${path}.linearVelocity`, 50, 50);
        if (body.angularVelocity !== undefined)
          range(body.angularVelocity, -20, 20, `${path}.angularVelocity`);
      }
      const pieceIds = new Set<unknown>();
      const list = array(body.pieces, `${path}.pieces`, 1, 16);
      pieces += list.length;
      list.forEach((item, j) => {
        const p = `${path}.pieces[${j}]`;
        const piece = object(item, p, ['id', 'shape', ...(dynamic ? ['density'] : [])]);
        id(piece.id, `${p}.id`);
        if (pieceIds.has(piece.id)) add('DUPLICATE_ID', `${p}.id`, 'unique piece ID within body');
        pieceIds.add(piece.id);
        if (piece.density !== undefined) {
          if (!dynamic) add('STATIC_DENSITY', `${p}.density`, 'absent on static pieces');
          else range(piece.density, 0.1, 20, `${p}.density`);
        }
        shape(piece.shape, `${p}.shape`, false);
      });
    });
  }
  const pairs = new Map<string, { enabled: unknown; path: string }[]>();
  array(level.fields, 'level.fields', 0, 64).forEach((item, i) => {
    const path = `level.fields[${i}]`;
    const field = object(item, path, ['id', 'position', 'angle', 'enabled', 'shape', 'force']);
    id(field.id, `${path}.id`);
    if (seen.has(field.id)) add('DUPLICATE_ID', `${path}.id`, 'unique body/field ID');
    seen.add(field.id);
    vector(field.position, `${path}.position`, 1000);
    range(field.angle, -100 * Math.PI, 100 * Math.PI, `${path}.angle`);
    boolean(field.enabled, `${path}.enabled`);
    shape(field.shape, `${path}.shape`, true);
    const f = `${path}.force`;
    const kind = (field.force as ObjectValue | null)?.kind;
    switch (kind) {
      case 'uniform': {
        const force = object(field.force, f, ['kind', 'density']);
        vector(force.density, `${f}.density`, 50, 50);
        break;
      }
      case 'attractor':
      case 'repulsor': {
        const force = object(field.force, f, ['kind', 'source', 'strength']);
        vector(force.source, `${f}.source`, 100);
        range(force.strength, 0.01, 50, `${f}.strength`);
        break;
      }
      case 'water': {
        const force = object(field.force, f, ['kind', 'drag', 'sinkSpeed']);
        range(force.drag, 0.01, 60, `${f}.drag`);
        range(force.sinkSpeed, 0.001, 1, `${f}.sinkSpeed`);
        break;
      }
      case 'lava':
        object(field.force, f, ['kind']);
        break;
      case 'portal': {
        const force = object(field.force, f, [
          'kind',
          'pairId',
          'rotateVelocity',
          'delaySeconds',
          'cooldownSeconds',
        ]);
        id(force.pairId, `${f}.pairId`);
        boolean(force.rotateVelocity, `${f}.rotateVelocity`);
        if (force.delaySeconds !== undefined)
          range(force.delaySeconds, 1 / 120, 10, `${f}.delaySeconds`);
        if (force.cooldownSeconds !== undefined)
          range(force.cooldownSeconds, 1 / 120, 30, `${f}.cooldownSeconds`);
        if (typeof force.pairId === 'string')
          pairs.set(force.pairId, [
            ...(pairs.get(force.pairId) ?? []),
            { enabled: field.enabled, path: f },
          ]);
        break;
      }
      default:
        add('FORCE', `${f}.kind`, 'a supported community force');
    }
  });
  for (const ends of pairs.values())
    if (ends.length !== 2 || ends[0]!.enabled !== ends[1]!.enabled)
      add('PORTAL_PAIR', `${ends[0]!.path}.pairId`, 'exactly two ends with matching enabled state');
  range(pairs.size, 0, 8, 'level.portalPairs');
  range(pieces, 1, 256, 'level.totalPieces');
  range(vertices, 0, 4096, 'level.totalVertices');
  const goal = object(level.goal, 'level.goal', [
    'bodyId',
    'minX',
    'maxX',
    'minY',
    'maxY',
    'holdSeconds',
  ]);
  const { bodyId, holdSeconds, ...goalBounds } = goal;
  id(bodyId, 'level.goal.bodyId');
  bounds(goalBounds, 'level.goal', false);
  if (
    !Array.isArray(level.dynamicBodies) ||
    !level.dynamicBodies.some(
      (body) => body && typeof body === 'object' && (body as ObjectValue).id === bodyId,
    )
  )
    add('GOAL_BODY', 'level.goal.bodyId', 'an existing dynamic body');
  range(holdSeconds, 0, 5, 'level.goal.holdSeconds');
  if (level.prediction !== undefined) {
    const prediction = object(level.prediction, 'level.prediction', [
      'maxTicks',
      'sampleEveryTicks',
    ]);
    range(prediction.maxTicks, 1, 1200, 'level.prediction.maxTicks', true);
    range(
      prediction.sampleEveryTicks,
      1,
      Math.min(120, Number(prediction.maxTicks)),
      'level.prediction.sampleEveryTicks',
      true,
    );
  }
  if (issues.length) throw new CommunityProfileError(issues);
  return { version: 2, level: { ...level, bounds: arenaBounds }, editor } as LevelDocument;
}

/** Expensive geometry/mass phase: call only in the browser or contained verifier. */
export function validateCommunityDocument(input: unknown): LevelDocument {
  const document = validateCommunityStructure(input);
  const issues: ProfileIssue[] = [];
  const add = (code: string, path: string, expected: string) =>
    issues.push({ code, path, expected });
  const area = (shape: PieceShape, path: string): number => {
    if (shape.kind === 'circle') return Math.PI * shape.radius * shape.radius;
    const polygon = shapePolygon(shape);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!,
        b = polygon[(i + 1) % polygon.length]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01)
        add('SHORT_EDGE', `${path}.edge[${i}]`, 'length at least 0.01');
    }
    const value = Math.abs(signedPolygonArea(polygon));
    if (value < 0.0001) add('AREA', path, 'area at least 0.0001');
    return value;
  };
  for (const [category, bodies] of [
    ['dynamicBodies', document.level.dynamicBodies],
    ['staticBodies', document.level.staticBodies],
  ] as const) {
    bodies.forEach((body, i) => {
      const path = `level.${category}[${i}]`;
      let mass = 0;
      body.pieces.forEach((piece, j) => {
        const pieceArea = area(piece.shape, `${path}.pieces[${j}].shape`);
        if ('density' in body && typeof body.density === 'number')
          mass += pieceArea * (piece.density ?? body.density);
      });
      if ('density' in body && (mass < 0.001 || mass > 10_000))
        add('MASS', `${path}.mass`, 'effective mass in [0.001, 10000]');
    });
  }
  document.level.fields.forEach((field, i) => area(field.shape, `level.fields[${i}].shape`));
  if (issues.length) throw new CommunityProfileError(issues);
  let validated: LevelDocument;
  try {
    validated = validateDocument(document);
  } catch (error) {
    throw new CommunityProfileError([
      {
        code: 'GEOMETRY',
        path: 'document',
        expected: error instanceof Error ? error.message : 'valid geometry',
      },
    ]);
  }
  const triangles = validated.level.fields.reduce(
    (sum, field) => sum + triangulateSimplePolygon(shapePolygon(field.shape)).length,
    0,
  );
  if (triangles > 2048) add('TRIANGLES', 'level.totalFieldTriangles', 'at most 2048');
  if (utf8Length(canonicalJson(validated.level)) > 128 * 1024)
    add('SIZE', 'level', 'canonical configuration at most 128 KiB');
  if (issues.length) throw new CommunityProfileError(issues);
  return validated;
}

export type ImportConversion = 'community-preview-limit' | 'remove-static-density';
/** Explicit opt-in only; the caller retains the original and can undo/export both copies. */
export function convertCommunityImport(
  input: unknown,
  conversions: readonly ImportConversion[],
): unknown {
  const copy = decodeStrictJson(new TextEncoder().encode(canonicalJson(input))) as ObjectValue;
  const level = ('formatVersion' in copy ? copy : copy.level) as ObjectValue;
  if (!level || typeof level !== 'object') throw new Error('Expected a level');
  if (
    conversions.includes('community-preview-limit') &&
    level.prediction &&
    typeof level.prediction === 'object'
  ) {
    const prediction = level.prediction as ObjectValue;
    if (typeof prediction.maxTicks === 'number' && prediction.maxTicks > 1200) {
      prediction.maxTicks = 1200;
      if (typeof prediction.sampleEveryTicks === 'number' && prediction.sampleEveryTicks > 120)
        prediction.sampleEveryTicks = 120;
    }
  }
  if (conversions.includes('remove-static-density') && Array.isArray(level.staticBodies))
    for (const body of level.staticBodies) {
      if (body && typeof body === 'object' && Array.isArray(body.pieces))
        for (const piece of body.pieces)
          if (piece && typeof piece === 'object') delete piece.density;
    }
  return copy;
}
