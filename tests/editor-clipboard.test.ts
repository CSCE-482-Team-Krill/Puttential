import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  copyObject,
  pasteObject,
  freshDocument,
  edit,
  move,
  place,
  presets,
  historyCommit,
  historyUndo,
  historyRedo,
} from '../level-editor/editor/model';

test('object clipboard snapshots properties, allocates IDs and preserves the goal through undo', () => {
  const original = edit(freshDocument(), (d) => {
    const body = d.level.dynamicBodies[0]!;
    body.angularVelocity = 2;
    body.pieces[0]!.density = 3;
  });
  const copied = copyObject(original, { kind: 'dynamicBodies', id: 'ball' });
  const moved = move(original, { kind: 'dynamicBodies', id: 'ball' }, { x: 1, y: 0 });
  const first = pasteObject(moved, copied);
  const second = pasteObject(first.doc, copied);
  assert.equal(first.selection.id, 'ball-1');
  assert.equal(second.selection.id, 'ball-2');
  const body = first.doc.level.dynamicBodies[1]!;
  assert.equal(body.position.x, -4);
  assert.equal(body.angularVelocity, 2);
  assert.equal(body.pieces[0]!.density, 3);
  assert.deepEqual(body.pieces[0]!.shape, { kind: 'circle', radius: 0.4 });
  assert.notEqual(body.pieces[0]!.id, original.level.dynamicBodies[0]!.pieces[0]!.id);
  assert.deepEqual(second.doc.level.goal, original.level.goal);
  const history = historyCommit({ past: [], present: moved, future: [] }, first.doc);
  assert.deepEqual(historyUndo(history).present, moved);
  assert.deepEqual(historyRedo(historyUndo(history)).present, first.doc);
  assert.equal(original.level.dynamicBodies.length, 1);
  assert.equal(copied.object.id, 'ball');
});

test('object clipboard supports fields and compound bodies across documents with strict bounds', () => {
  for (const id of ['fields:attractor', 'staticBodies:ell', 'dynamicBodies:ell']) {
    const source = place(
      freshDocument(),
      presets.find((p) => p.id === id)!,
      { x: 0, y: 0 },
    );
    const copied = copyObject(source.doc, source.selection);
    const pasted = pasteObject(freshDocument(), copied);
    const object = pasted.doc.level[copied.kind].find((o) => o.id === pasted.selection.id)!;
    assert.deepEqual(object.position, copied.object.position);
    if ('force' in object && 'force' in copied.object)
      assert.deepEqual(object.force, copied.object.force);
    if ('pieces' in object && 'pieces' in copied.object)
      assert.deepEqual(
        object.pieces.map((p) => p.shape),
        copied.object.pieces.map((p) => p.shape),
      );
  }
  const doc = freshDocument();
  const outside = place(
    doc,
    presets.find((p) => p.id === 'staticBodies:rectangle')!,
    { x: 6, y: 0 },
  );
  const narrow = edit(doc, (d) => {
    d.editor.arena.walls = [];
    d.level.staticBodies = [];
    d.editor.arena.bounds.maxX = 5.5;
  });
  assert.throws(
    () => pasteObject(narrow, copyObject(outside.doc, outside.selection)),
    /outside the board/,
  );
  assert.equal(narrow.level.staticBodies.length, 0);
  assert.throws(() => copyObject(doc, { kind: 'goal', id: 'goal' }), /Select a body or field/);
  assert.throws(() => copyObject(doc, { kind: 'staticBodies', id: 'left-rail' }), /Board controls/);
});
