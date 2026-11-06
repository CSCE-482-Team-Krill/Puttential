import { levelName, starterDocument, starterLevels, validateDocument } from '../../src/game';
import type { EditorPersistence } from '../../src/editor/persistence';

const recoveryKey = 'puttential-editor-v1';
async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Repository request failed');
  return data;
}
/** Trusted localhost wrapper only. The public editor must inject its own cloud adapter. */
export const repositoryPersistence: EditorPersistence = {
  labels: {
    save: 'Save to repository',
    saved: 'Saved to repository',
    library: 'Repository library',
    starters: 'Legacy courses',
  },
  starters: starterLevels.map((level, i) => ({
    id: level.id,
    label: levelName(level),
    load: () => starterDocument(i),
  })),
  list: async () => (await responseData(await fetch('/api/levels'))).levels,
  load: async (id) => {
    const data = await responseData(await fetch(`/api/levels?id=${encodeURIComponent(id)}`));
    return { ...data, document: validateDocument(data.document) };
  },
  save: async (document, revision) => {
    const data = await responseData(
      await fetch('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document, revision }),
      }),
    );
    return { ...data, document: validateDocument(data.document) };
  },
  importFile: async (file) => {
    if (file.size > 2_000_000) throw new Error('File is too large');
    return validateDocument(JSON.parse(await file.text()));
  },
  recovery: {
    read: () => {
      const raw = localStorage.getItem(recoveryKey);
      return raw ? validateDocument(JSON.parse(raw)) : null;
    },
    write: (document) => localStorage.setItem(recoveryKey, JSON.stringify(document)),
  },
};
