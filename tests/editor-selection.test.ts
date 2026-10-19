import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  freshDocument,
  place,
  presets,
  toggleSelection,
  moveObjects,
  historyCommit,
  historyUndo,
  regionSelection,
} from '../level-editor/editor/model';

test('Ctrl-click selection toggles independent objects and group movement is atomic and bounded', () => {
  const ball = { kind: 'dynamicBodies' as const, id: 'ball' };
  const placed = place(
    freshDocument(),
    presets.find((p) => p.id === 'staticBodies:square')!,
    { x: 0, y: 0 },
  );
  let selected = toggleSelection([], ball);
  selected = toggleSelection(selected, placed.selection);
  assert.equal(selected.length, 2);
  assert.deepEqual(toggleSelection(selected, ball), [placed.selection]);
  const moved = moveObjects(placed.doc, selected, { x: 1, y: 1 });
  assert.equal(moved.level.dynamicBodies[0]!.position.x, -3);
  assert.equal(moved.level.staticBodies.at(-1)!.position.x, 1);
  assert.deepEqual(
    historyUndo(historyCommit({ past: [], present: placed.doc, future: [] }, moved)).present,
    placed.doc,
  );
  assert.throws(() => moveObjects(placed.doc, selected, { x: 20, y: 0 }), /outside the board/);
  assert.equal(placed.doc.level.dynamicBodies[0]!.position.x, -4);
});

test('right-drag region encloses full objects in either direction and excludes boundary walls', () => {
  const placed = place(
    freshDocument(),
    presets.find((p) => p.id === 'staticBodies:square')!,
    { x: 0, y: 0 },
  );
  const a = { x: -5, y: -1 },
    b = { x: 1, y: 1 };
  assert.deepEqual(regionSelection(placed.doc, a, b), [
    { kind: 'dynamicBodies', id: 'ball' },
    placed.selection,
  ]);
  assert.deepEqual(regionSelection(placed.doc, b, a), regionSelection(placed.doc, a, b));
  assert.deepEqual(regionSelection(placed.doc, { x: -4, y: -1 }, { x: -3, y: 1 }), []);
  assert.equal(regionSelection(placed.doc, { x: -8, y: -5 }, { x: 8, y: 5 }).length, 2);
});

test('group clipboard snapshots all objects, preserves relative positions, relinks portals and pastes atomically', async () => {
  const { copyObjects, pasteObjects, edit, removeObjects } =
    await import('../level-editor/editor/model');
  const pair = place(
    freshDocument(),
    presets.find((p) => p.id === 'fields:portal')!,
    { x: -1, y: 0 },
  );
  const selected = [
    { kind: 'dynamicBodies' as const, id: 'ball' },
    ...pair.doc.level.fields.map((f) => ({ kind: 'fields' as const, id: f.id })),
  ];
  const copied = copyObjects(pair.doc, selected);
  const moved = moveObjects(pair.doc, selected, { x: 1, y: 0 });
  const pasted = pasteObjects(moved, copied);
  assert.equal(pasted.selections.length, 3);
  assert.equal(pasted.doc.level.dynamicBodies[1]!.position.x, -4);
  assert.equal(pasted.doc.level.fields[2]!.position.x, -1);
  assert.equal(pasted.doc.level.fields[3]!.position.x, 1);
  const forces = pasted.doc.level.fields.map((f) => f.force);
  assert.ok(forces.every((f) => f.kind === 'portal'));
  if (
    forces[0]!.kind === 'portal' &&
    forces[2]!.kind === 'portal' &&
    forces[3]!.kind === 'portal'
  ) {
    assert.notEqual(forces[0]!.pairId, forces[2]!.pairId);
    assert.equal(forces[2]!.pairId, forces[3]!.pairId);
  }
  assert.equal(pasteObjects(pasted.doc, copied).doc.level.fields.length, 6);
  const narrow = edit(freshDocument(), (d) => {
    d.editor.arena.walls = [];
    d.level.staticBodies = [];
    d.editor.arena.bounds.minX = -3.5;
    d.level.dynamicBodies[0]!.position.x = 0;
  });
  assert.throws(() => pasteObjects(narrow, copied), /outside the board/);
  assert.equal(narrow.level.fields.length, 0);
  assert.throws(() => removeObjects(pair.doc, selected), /goal target/);
  assert.deepEqual(
    historyUndo(historyCommit({ past: [], present: moved, future: [] }, pasted.doc)).present,
    moved,
  );
});
