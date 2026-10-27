import type { Bounds } from '../geometry/polygon';
import type { Level } from './types';
import { parseLevel, parseLevelBounds } from './parse';
import { shapeBounds, unionBounds } from '../geometry/authoring';

export type LevelData = { -readonly [K in keyof Level]: Level[K] };
export type Arena = { bounds: Bounds; walls: readonly string[]; thickness: number };
/** In-memory editor document. Saved game JSON is only `level`; metadata is a sidecar. */
export type LevelDocument = {
  version: 2;
  level: LevelData;
  editor: { name: string; arena: Arena };
};
export const decodeLevel = parseLevel;
export const encodeLevel = (level: Level): LevelData => parseLevel(level);
export function levelName(level: Pick<Level, 'id'>): string {
  return level.id
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`${label}.${key} is unsupported`);
}
export function parseBounds(value: unknown): Bounds {
  return parseLevelBounds(value, 'bounds');
}

export function levelBounds(level: Level): Bounds {
  if (level.bounds) return { ...level.bounds };
  return unionBounds([
    ...[...level.dynamicBodies, ...level.staticBodies].flatMap((body) =>
      body.pieces.map((piece) => shapeBounds(piece.shape, body.position, body.angle)),
    ),
    ...level.fields.map((field) => shapeBounds(field.shape, field.position, field.angle)),
    level.goal,
  ]);
}
/** Migration is explicit and lossless for supported mechanics; a 12-gon stays a polygon. */
function migrateLegacy(raw: Record<string, unknown>): unknown {
  keys(raw, ['version', 'level', 'editor'], 'legacy document');
  const level = object(raw.level, 'legacy level');
  keys(
    level,
    ['id', 'name', 'gravity', 'dynamicBodies', 'staticBodies', 'fields', 'goal'],
    'legacy level',
  );
  const { name, goal, ...rest } = level;
  const bodies = (value: unknown) => {
    if (!Array.isArray(value)) throw new Error('Legacy bodies must be an array');
    return value.map((rawBody) => {
      const body = object(rawBody, 'body');
      if (!Array.isArray(body.pieces)) throw new Error('Legacy pieces must be an array');
      return {
        ...body,
        pieces: body.pieces.map((rawPiece) => {
          const { localPolygon, ...piece } = object(rawPiece, 'piece');
          return { ...piece, shape: { kind: 'polygon', points: localPolygon } };
        }),
      };
    });
  };
  if (!Array.isArray(level.fields)) throw new Error('Legacy fields must be an array');
  const fields = level.fields.map((rawField) => {
    const { localPolygon, force: rawForce, ...field } = object(rawField, 'field');
    const force = object(rawForce, 'force');
    keys(force, ['kind', 'params'], 'legacy force');
    if (!['uniform', 'attractor', 'repulsor'].includes(String(force.kind)))
      throw new Error(
        `Legacy force ${String(force.kind)} is not supported by the current game engine. The original file has not been changed.`,
      );
    return {
      ...field,
      shape: { kind: 'polygon', points: localPolygon },
      force: { ...object(force.params, 'force.params'), kind: force.kind },
    };
  });
  const g = object(goal, 'goal');
  keys(g, ['bodyId', 'area', 'holdSeconds'], 'legacy goal');
  return {
    version: 2,
    level: {
      ...rest,
      formatVersion: 1,
      version: 1,
      dynamicBodies: bodies(level.dynamicBodies),
      staticBodies: bodies(level.staticBodies),
      fields,
      goal: { bodyId: g.bodyId, ...object(g.area, 'goal.area'), holdSeconds: g.holdSeconds },
    },
    editor: { ...object(raw.editor, 'editor'), name },
  };
}
export function parseDocument(value: unknown): LevelDocument {
  let raw = object(value, 'document');
  if ('formatVersion' in raw) {
    const level = parseLevel(raw);
    return {
      version: 2,
      level,
      editor: {
        name: levelName(level),
        arena: { bounds: levelBounds(level), walls: [], thickness: 0.5 },
      },
    };
  }
  if (raw.version === 1) raw = object(migrateLegacy(raw), 'migrated document');
  keys(raw, ['version', 'level', 'editor'], 'document');
  if (raw.version !== 2) throw new Error(`Unsupported document version: ${String(raw.version)}`);
  let level = parseLevel(raw.level);
  const editor = object(raw.editor, 'editor');
  keys(editor, ['name', 'arena'], 'editor');
  if (typeof editor.name !== 'string' || !editor.name.trim())
    throw new Error('Editor name must be nonempty');
  const arena = object(editor.arena, 'arena');
  keys(arena, ['bounds', 'walls', 'thickness'], 'arena');
  const bounds = parseBounds(arena.bounds);
  if (
    typeof arena.thickness !== 'number' ||
    !Number.isFinite(arena.thickness) ||
    arena.thickness <= 0
  )
    throw new Error('Wall thickness must be positive and finite');
  if (!Array.isArray(arena.walls) || arena.walls.some((id) => typeof id !== 'string'))
    throw new Error('Wall IDs must be an array of strings');
  const walls = arena.walls as string[];
  if (walls.length !== 0 && (walls.length !== 4 || new Set(walls).size !== 4))
    throw new Error('Arena needs zero or four distinct wall IDs');
  if (walls.some((id) => !level.staticBodies.some((body) => body.id === id)))
    throw new Error('Arena references a missing wall');
  const matchesBounds = (a: Bounds, b: Bounds) =>
    (['minX', 'maxX', 'minY', 'maxY'] as const).every((k) => Math.abs(a[k] - b[k]) <= 1e-8);
  if (level.bounds && !matchesBounds(level.bounds, bounds))
    throw new Error('Editor board bounds must match level bounds');
  // Preserve older sidecar-only board sizes when the file is next saved or playtested.
  if (!level.bounds && !matchesBounds(levelBounds(level), bounds))
    level = { ...level, bounds: { ...bounds } };
  return {
    version: 2,
    level,
    editor: { name: editor.name, arena: { bounds, walls: [...walls], thickness: arena.thickness } },
  };
}
