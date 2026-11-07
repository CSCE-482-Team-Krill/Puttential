import { levelName, starterDocument, starterLevels, validateDocument } from '../game';
import type { EditorPersistence, StoredEditorDocument } from './persistence';

const draftPrefix = 'puttential-editor-draft-v1/';
const recoveryKey = 'puttential-website-editor-recovery-v1';

function readDraft(raw: string): StoredEditorDocument {
  const data = JSON.parse(raw);
  if (!data || typeof data.revision !== 'string') throw new Error('Invalid saved draft');
  return { document: validateDocument(data.document), revision: data.revision };
}

/** Device-local authoring; no repository or community publication capabilities. */
export function createBrowserEditorPersistence(
  storage: () => Storage = () => localStorage,
): EditorPersistence {
  const revisions = new Map<string, string>();
  return {
    labels: {
      save: 'Save draft',
      saved: 'Saved on this device',
      library: 'My drafts',
      starters: 'Legacy courses',
    },
    starters: starterLevels.map((level, index) => ({
      id: level.id,
      label: levelName(level),
      load: () => starterDocument(index),
    })),
    async list() {
      const store = storage();
      const ids: string[] = [];
      for (let index = 0; index < store.length; index++) {
        const key = store.key(index);
        if (key?.startsWith(draftPrefix))
          ids.push(decodeURIComponent(key.slice(draftPrefix.length)));
      }
      return ids.sort();
    },
    async load(id) {
      const raw = storage().getItem(`${draftPrefix}${encodeURIComponent(id)}`);
      if (!raw) throw new Error('This draft is no longer saved on this device.');
      const draft = readDraft(raw);
      revisions.set(id, draft.revision);
      return draft;
    },
    async save(document, revision) {
      const next = validateDocument(document);
      const store = storage();
      const key = `${draftPrefix}${encodeURIComponent(next.level.id)}`;
      const raw = store.getItem(key);
      const previous = raw ? readDraft(raw) : null;
      if ((previous?.revision ?? null) !== revision)
        throw new Error('This draft changed in another tab. Reopen it before saving.');
      if (previous && JSON.stringify(previous.document.level) !== JSON.stringify(next.level))
        next.level.version = Math.max(next.level.version, previous.document.level.version + 1);
      const saved = { document: next, revision: crypto.randomUUID() };
      store.setItem(key, JSON.stringify(saved));
      revisions.set(next.level.id, saved.revision);
      return saved;
    },
    async importFile(file) {
      if (file.size > 2_000_000) throw new Error('File is too large');
      return validateDocument(JSON.parse(await file.text()));
    },
    recovery: {
      read() {
        const raw = storage().getItem(recoveryKey);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || (data.revision !== null && typeof data.revision !== 'string'))
          throw new Error('Invalid recovery draft');
        const document = validateDocument(data.document);
        if (data.revision) revisions.set(document.level.id, data.revision);
        return { document, revision: data.revision };
      },
      write(document) {
        storage().setItem(
          recoveryKey,
          JSON.stringify({ document, revision: revisions.get(document.level.id) ?? null }),
        );
      },
    },
  };
}
