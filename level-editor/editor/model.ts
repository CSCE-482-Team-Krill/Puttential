import {
  forceCatalog,
  shapePresets,
  rectangle,
  shapeOutline,
  shapeBounds,
  shapePolygon,
  unionBounds,
  pointInPolygon,
  validateDocument,
  documentFromLevel,
  transformPolygon,
  polygonBounds,
  triangulateSimplePolygon,
} from '../../src/game';
import type { LevelDocument, LevelData, Vec2, PieceShape, Bounds } from '../../src/game';
import { arenaGeometry } from '../../src/game/levels/document';
const material = { restitution: 0.8 };

export type Kind = 'dynamicBodies' | 'staticBodies' | 'fields';
export type Selection = { kind: Kind | 'goal'; id: string };
export type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
export type DraftDocument = Mutable<LevelDocument>;
export type Item =
  | Mutable<LevelData['dynamicBodies'][number]>
  | Mutable<LevelData['staticBodies'][number]>
  | Mutable<LevelData['fields'][number]>;
export function isDynamic(object: Item): object is Mutable<LevelData['dynamicBodies'][number]> {
  return 'density' in object;
}
export type Preset = { id: string; label: string; category: Kind; shape?: string; force?: string };
export const presets: readonly Preset[] = [
  ...(['staticBodies', 'dynamicBodies'] as const).flatMap((category) =>
    shapePresets.map((shape) => ({
      id: `${category}:${shape.id}`,
      label: shape.label,
      category,
      shape: shape.id,
    })),
  ),
  ...forceCatalog.map((force) => ({
    id: `fields:${force.kind}`,
    label: `${force.glyph} ${force.label}`,
    category: 'fields' as const,
    force: force.kind,
  })),
];

export function freshDocument(): LevelDocument {
  const walls = ['left', 'right', 'bottom', 'top'].map((side) => `${side}-rail`);
  const arena = {
    bounds: { minX: -7.4, maxX: 7.4, minY: -4.25, maxY: 4.25 },
    walls,
    thickness: 0.5,
  };
  const doc = documentFromLevel(
    {
      formatVersion: 1,
      id: 'untitled-course',
      version: 1,
      gravity: { x: 0, y: 0 },
      staticBodies: arenaGeometry(arena).map((geometry, i) => ({
        id: walls[i]!,
        position: geometry.position,
        angle: 0,
        material,
        pieces: [{ id: `${walls[i]}-piece`, shape: geometry.shape }],
      })),
      dynamicBodies: [
        {
          id: 'ball',
          position: { x: -4, y: 0 },
          angle: 0,
          density: 1,
          material,
          ccd: true,
          pieces: [{ id: 'ball-piece', shape: { kind: 'circle', radius: 0.4 } }],
        },
      ],
      fields: [],
      goal: { bodyId: 'ball', minX: 4, maxX: 5.5, minY: -0.75, maxY: 0.75, holdSeconds: 1 },
    },
    walls,
  );
  doc.editor.name = 'Untitled course';
  return doc;
}
export function shapes(object: Item): PieceShape[] {
  return 'pieces' in object ? object.pieces.map((p) => p.shape) : [object.shape];
}
export function localBounds(object: Item): Bounds {
  return unionBounds(shapes(object).map((s) => shapeBounds(s)));
}
export function objectBounds(doc: LevelDocument, selected: Selection): Bounds {
  const object = item(doc, selected);
  return object
    ? unionBounds(shapes(object).map((s) => shapeBounds(s, object.position, object.angle)))
    : doc.level.goal;
}
export function hasCircle(object: Item): boolean {
  return shapes(object).some((s) => s.kind === 'circle');
}
/** Vertex editing explicitly changes a rectangle into a polygon. A circle has no vertices. */
export function editablePolygon(object: Item, piece: number): Mutable<Vec2>[] {
  const owner = 'pieces' in object ? object.pieces[piece]! : object;
  if (owner.shape.kind === 'circle')
    throw new Error('A circle has no vertices. Edit its radius or replace its outline explicitly.');
  if (owner.shape.kind === 'rectangle')
    owner.shape = { kind: 'polygon', points: rectangle(owner.shape.width, owner.shape.height) };
  return owner.shape.points;
}
export function objectContains(doc: LevelDocument, selected: Selection, point: Vec2): boolean {
  const object = item(doc, selected);
  if (!object) return objectPolygons(doc, selected).some((p) => pointInPolygon(point, p));
  return shapes(object).some((s) =>
    s.kind === 'circle'
      ? Math.hypot(point.x - object.position.x, point.y - object.position.y) <= s.radius
      : pointInPolygon(point, transformPolygon(shapePolygon(s), object.position, object.angle)),
  );
}
export function edit(doc: LevelDocument, change: (next: DraftDocument) => void): LevelDocument {
  const next = structuredClone(doc) as DraftDocument;
  change(next);
  return validateDocument(next);
}
export function item(doc: LevelDocument, selected: Selection): Item | undefined {
  return selected.kind === 'goal'
    ? undefined
    : (doc.level[selected.kind].find((object) => object.id === selected.id) as Item | undefined);
}
export function mutableItem(doc: DraftDocument, selected: Selection): Item {
  if (selected.kind === 'goal') throw new Error('Select a body or field');
  const object = doc.level[selected.kind].find((object) => object.id === selected.id);
  if (!object) throw new Error('Object no longer exists');
  if (selected.kind === 'staticBodies' && doc.editor.arena.walls.includes(selected.id))
    throw new Error('Use Board controls to edit managed walls');
  return object as Item;
}
export function uniqueId(doc: LevelDocument, prefix: string): string {
  const ids = new Set(
    [...doc.level.dynamicBodies, ...doc.level.staticBodies, ...doc.level.fields].map((o) => o.id),
  );
  let i = 1;
  while (ids.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
export function place(
  doc: LevelDocument,
  preset: Preset,
  position: Vec2,
): { doc: LevelDocument; selection: Selection } {
  const id = uniqueId(doc, preset.force ?? preset.shape ?? 'object');
  const next = edit(doc, (draft) => {
    if (preset.category === 'fields') {
      const force = forceCatalog.find((f) => f.kind === preset.force)!;
      draft.level.fields.push({
        id,
        position: { ...position },
        angle: 0,
        enabled: false,
        shape: { kind: 'rectangle', width: 2, height: 2 },
        force: structuredClone(force.create()),
      });
    } else {
      const pieces = shapePresets
        .find((s) => s.id === preset.shape)!
        .pieces()
        .map((shape, index) => ({
          id: `${id}-piece-${index + 1}`,
          shape: structuredClone(shape) as Mutable<PieceShape>,
        }));
      const body = { id, position: { ...position }, angle: 0, material: { ...material }, pieces };
      if (preset.category === 'dynamicBodies')
        draft.level.dynamicBodies.push({ ...body, density: 1, ccd: true });
      else draft.level.staticBodies.push(body);
    }
  });
  return { doc: next, selection: { kind: preset.category, id } };
}
export function move(doc: LevelDocument, selected: Selection, delta: Vec2): LevelDocument {
  return edit(doc, (draft) => {
    if (selected.kind === 'goal') {
      const area = draft.level.goal;
      area.minX += delta.x;
      area.maxX += delta.x;
      area.minY += delta.y;
      area.maxY += delta.y;
    } else {
      const object = mutableItem(draft, selected);
      object.position.x += delta.x;
      object.position.y += delta.y;
    }
  });
}
export function objectPolygons(doc: LevelDocument, selected: Selection): Vec2[][] {
  if (selected.kind === 'goal') {
    const b = doc.level.goal;
    return [
      [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ],
    ];
  }
  const object = item(doc, selected);
  if (!object) return [];
  return shapes(object)
    .map(shapeOutline)
    .map((p) => transformPolygon(p, object.position, object.angle));
}
export function remove(doc: LevelDocument, selected: Selection): LevelDocument {
  if (selected.kind === 'goal') throw new Error('A level must have a goal');
  if (doc.level.goal.bodyId === selected.id && selected.kind === 'dynamicBodies')
    throw new Error('Choose another goal target before deleting this body');
  return edit(doc, (draft) => {
    mutableItem(draft, selected);
    const list = draft.level[selected.kind as Kind];
    list.splice(
      list.findIndex((object) => object.id === selected.id),
      1,
    );
  });
}
export type CopiedObject = {
  [K in Kind]: { kind: K; object: LevelData[K][number] };
}[Kind];
export function copyObject(doc: LevelDocument, selected: Selection): CopiedObject {
  const object = item(doc, selected);
  if (!object) throw new Error('Select a body or field to copy');
  if (selected.kind === 'staticBodies' && doc.editor.arena.walls.includes(selected.id))
    throw new Error('Use Board controls to edit managed walls');
  return structuredClone({ kind: selected.kind, object }) as CopiedObject;
}
export function pasteObject(doc: LevelDocument, copied: CopiedObject) {
  const id = uniqueId(doc, copied.object.id);
  const next = edit(doc, (draft) => {
    const copy = structuredClone(copied.object) as Item;
    copy.id = id;
    if ('pieces' in copy)
      copy.pieces.forEach((p, i) => {
        p.id = `${id}-piece-${i + 1}`;
      });
    // Keep the copied position; validation rejects pasting outside the destination board.
    (draft.level[copied.kind] as Item[]).push(copy);
  });
  return { doc: next, selection: { kind: copied.kind, id } };
}
export function duplicate(doc: LevelDocument, selected: Selection) {
  return pasteObject(doc, copyObject(doc, selected));
}
export function scaleObject(
  doc: LevelDocument,
  selected: Selection,
  width: number,
  height: number,
): LevelDocument {
  if (!(width > 0 && height > 0)) throw new Error('Dimensions must be positive');
  return edit(doc, (draft) => {
    if (selected.kind === 'goal') {
      const b = draft.level.goal,
        x = (b.minX + b.maxX) / 2,
        y = (b.minY + b.maxY) / 2;
      draft.level.goal = {
        ...draft.level.goal,
        minX: x - width / 2,
        maxX: x + width / 2,
        minY: y - height / 2,
        maxY: y + height / 2,
      };
    } else {
      const object = mutableItem(draft, selected);
      const b = localBounds(object),
        sx = width / (b.maxX - b.minX),
        sy = height / (b.maxY - b.minY);
      if (hasCircle(object) && Math.abs(sx - sy) > 1e-8)
        throw new Error(
          'Circles must scale uniformly. Edit the radius, or keep width and height proportional.',
        );
      function scale(shape: Mutable<PieceShape>) {
        if (shape.kind === 'circle') shape.radius *= sx;
        else if (shape.kind === 'rectangle') {
          shape.width *= sx;
          shape.height *= sy;
        } else
          shape.points.forEach((p) => {
            p.x *= sx;
            p.y *= sy;
          });
      }
      if ('pieces' in object) object.pieces.forEach((p) => scale(p.shape));
      else scale(object.shape);
      if ('force' in object && 'source' in object.force) {
        object.force.source.x *= sx;
        object.force.source.y *= sy;
      }
    }
  });
}
export function setOutline(
  doc: LevelDocument,
  selected: Selection,
  outline: Vec2[],
): LevelDocument {
  return edit(doc, (draft) => {
    const object = mutableItem(draft, selected);
    if ('pieces' in object)
      object.pieces = triangulateSimplePolygon(outline).map((localPolygon, i) => ({
        id: `${object.id}-piece-${i + 1}`,
        shape: { kind: 'polygon', points: localPolygon },
      }));
    else object.shape = { kind: 'polygon', points: outline };
  });
}

export type History = { past: LevelDocument[]; present: LevelDocument; future: LevelDocument[] };
export function historyCommit(history: History, next: LevelDocument): History {
  validateDocument(next);
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return { past: [...history.past.slice(-99), history.present], present: next, future: [] };
}
export function historyUndo(h: History): History {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1]!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function historyRedo(h: History): History {
  return h.future.length
    ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) }
    : h;
}
