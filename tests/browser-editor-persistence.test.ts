import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserEditorPersistence } from '../src/editor/browser-persistence';
import { freshDocument } from '../src/editor/model';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

test('device drafts round-trip metadata, advance changed content and reject stale saves', async () => {
  const store = memoryStorage();
  const persistence = createBrowserEditorPersistence(() => store);
  const document = freshDocument();
  document.editor.name = 'Browser course';
  const first = await persistence.save(document, null);
  assert.deepEqual((await persistence.load(document.level.id)).document, document);
  assert.deepEqual(await persistence.list(), [document.level.id]);
  const secondTab = await persistence.load(document.level.id);
  const changed = structuredClone(first.document);
  changed.level.gravity.y -= 1;
  const second = await persistence.save(changed, first.revision);
  assert.equal(second.document.level.version, document.level.version + 1);
  await assert.rejects(persistence.save(secondTab.document, secondTab.revision), /another tab/);
  await assert.rejects(persistence.save(document, null), /another tab/);
  assert.deepEqual(await persistence.load(document.level.id), second);
});

test('device recovery preserves original data when reading fails and surfaces storage failures', async () => {
  const store = memoryStorage();
  const persistence = createBrowserEditorPersistence(() => store);
  const document = freshDocument();
  persistence.recovery.write(document);
  assert.deepEqual(persistence.recovery.read(), { document, revision: null });
  const recoveryKey = store.key(0)!;
  const incompatible = '{"version":999}';
  store.setItem(recoveryKey, incompatible);
  assert.throws(() => persistence.recovery.read());
  assert.equal(store.getItem(recoveryKey), incompatible);
  store.setItem = () => {
    throw new Error('Storage full');
  };
  await assert.rejects(persistence.save(document, null), /Storage full/);
  assert.deepEqual(await persistence.list(), []);
});

test('recovery retains its original save revision so another tab cannot be overwritten', async () => {
  const store = memoryStorage();
  const original = createBrowserEditorPersistence(() => store);
  const saved = await original.save(freshDocument(), null);
  const unfinished = structuredClone(saved.document);
  unfinished.editor.name = 'Unfinished changes';
  original.recovery.write(unfinished, saved.revision);
  const otherTab = createBrowserEditorPersistence(() => store);
  const concurrent = structuredClone(saved.document);
  concurrent.editor.name = 'Saved in another tab';
  await otherTab.save(concurrent, saved.revision);
  const recovered = await createBrowserEditorPersistence(() => store).recovery.read();
  assert.ok(recovered && 'document' in recovered);
  assert.equal(recovered.revision, saved.revision);
  assert.deepEqual(recovered.document, unfinished);
  await assert.rejects(original.save(recovered.document, recovered.revision), /another tab/);
});

test('opening a newer draft cannot change the revision of the current recovery document', async () => {
  const store = memoryStorage();
  const persistence = createBrowserEditorPersistence(() => store);
  const saved = await persistence.save(freshDocument(), null);
  const other = createBrowserEditorPersistence(() => store);
  const newer = await other.save(saved.document, saved.revision);
  await persistence.load(saved.document.level.id); // The user may cancel replacing their work.
  persistence.recovery.write(saved.document, saved.revision);
  const recovered = persistence.recovery.read();
  assert.ok(recovered && 'document' in recovered);
  assert.equal(recovered.revision, saved.revision);
  assert.notEqual(recovered.revision, newer.revision);
  await assert.rejects(persistence.save(recovered.document, recovered.revision), /another tab/);
  persistence.recovery.write(saved.document); // An import is a new unsaved document.
  assert.equal((persistence.recovery.read() as { revision: unknown }).revision, null);
});

test('malformed draft keys do not prevent access to valid device drafts', async () => {
  const store = memoryStorage();
  const persistence = createBrowserEditorPersistence(() => store);
  const saved = await persistence.save(freshDocument(), null);
  store.setItem('puttential-editor-draft-v1/%invalid', '{}');
  assert.deepEqual(await persistence.list(), [saved.document.level.id]);
});
