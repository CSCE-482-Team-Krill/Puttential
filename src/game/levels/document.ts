import { polygonBounds, transformPolygon } from '../geometry/polygon';
import type { Bounds } from '../geometry/polygon';
import type { Level } from './types';
import { levelBounds, levelName, encodeLevel, parseDocument } from './codec';
import type { Arena, LevelDocument } from './codec';

import { shapePolygon } from '../geometry/shapes';
import { shapeBounds } from '../geometry/authoring';

const EPSILON = 1e-8;
export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minX >= outer.minX - EPSILON &&
    inner.maxX <= outer.maxX + EPSILON &&
    inner.minY >= outer.minY - EPSILON &&
    inner.maxY <= outer.maxY + EPSILON
  );
}

export function arenaGeometry(arena: Arena) {
  const { minX, maxX, minY, maxY } = arena.bounds;
  const w = maxX - minX,
    h = maxY - minY,
    t = arena.thickness;
  if (w <= 2 * t || h <= 2 * t)
    throw new Error('Arena must be wider and taller than twice its wall thickness');
  return [
    {
      position: { x: minX + t / 2, y: (minY + maxY) / 2 },
      shape: { kind: 'rectangle' as const, width: t, height: h },
    },
    {
      position: { x: maxX - t / 2, y: (minY + maxY) / 2 },
      shape: { kind: 'rectangle' as const, width: t, height: h },
    },
    {
      position: { x: (minX + maxX) / 2, y: minY + t / 2 },
      shape: { kind: 'rectangle' as const, width: w, height: t },
    },
    {
      position: { x: (minX + maxX) / 2, y: maxY - t / 2 },
      shape: { kind: 'rectangle' as const, width: w, height: t },
    },
  ];
}

/** Strict authoring limits, separate from simulation (a moving body can leave an open course). */
export function validateDocument(value: unknown): LevelDocument {
  const doc = parseDocument(value);
  const { bounds } = doc.editor.arena;
  for (const body of [...doc.level.dynamicBodies, ...doc.level.staticBodies]) {
    for (const piece of body.pieces) {
      if (!containsBounds(bounds, shapeBounds(piece.shape, body.position, body.angle)))
        throw new Error(`${body.id} extends outside the board`);
    }
  }
  for (const field of doc.level.fields) {
    if (
      !containsBounds(
        bounds,
        polygonBounds(transformPolygon(shapePolygon(field.shape), field.position, field.angle)),
      )
    )
      throw new Error(`${field.id} extends outside the board`);
  }
  if (!containsBounds(bounds, doc.level.goal)) throw new Error('Goal extends outside the board');
  if (doc.editor.arena.walls.length) {
    const expected = arenaGeometry(doc.editor.arena);
    doc.editor.arena.walls.forEach((id, index) => {
      const body = doc.level.staticBodies.find((b) => b.id === id)!;
      const target = expected[index]!;
      const actual = polygonBounds(
        body.pieces.flatMap((piece) =>
          transformPolygon(
            piece.shape.kind === 'circle' ? [] : shapePolygon(piece.shape),
            body.position,
            body.angle,
          ),
        ),
      );
      const wanted = polygonBounds(
        transformPolygon(shapePolygon(target.shape), target.position, 0),
      );
      if (
        body.pieces.length !== 1 ||
        body.pieces[0]!.shape.kind === 'circle' ||
        body.angle !== 0 ||
        Object.keys(wanted).some(
          (key) => Math.abs(actual[key as keyof Bounds] - wanted[key as keyof Bounds]) > EPSILON,
        )
      )
        throw new Error(
          `${id}: managed walls must match the arena. Use Board controls to resize them.`,
        );
    });
  }
  return doc;
}

export function documentFromLevel(level: Level, walls: readonly string[] = []): LevelDocument {
  return validateDocument({
    version: 2,
    level: encodeLevel(level),
    editor: {
      name: levelName(level),
      arena: { bounds: levelBounds(level), walls, thickness: 0.5 },
    },
  });
}

export function resizeArena(document: LevelDocument, bounds: Bounds): LevelDocument {
  const next = structuredClone(document);
  next.editor.arena.bounds = bounds;
  const geometry = arenaGeometry(next.editor.arena);
  next.level.staticBodies = next.level.staticBodies.map((body) => {
    const index = next.editor.arena.walls.indexOf(body.id);
    if (index < 0) return body;
    const shape = geometry[index]!;
    return {
      ...body,
      position: shape.position,
      angle: 0,
      pieces: [{ ...body.pieces[0]!, shape: shape.shape }],
    };
  });
  return validateDocument(next);
}
