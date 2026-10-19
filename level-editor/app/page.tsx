'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  starterDocument,
  starterLevels,
  levelName,
  resizeArena,
  validateDocument,
} from '../../src/game';
import type { LevelDocument } from '../../src/game';
import { Icon } from '../../src/frontend/icon';
import { EditorCanvas } from '../components/editor-canvas';
import { Inspector, NumberInput } from '../components/inspector';
import { Playtest } from '../components/playtest';
import {
  sameSelection,
  toggleSelection,
  removeObjects,
  copyObjects,
  edit,
  freshDocument,
  historyCommit,
  historyRedo,
  historyUndo,
  mutableItem,
  pasteObjects,
  presets,
} from '../editor/model';
import type { CopiedObject, History, Selection } from '../editor/model';

const RECOVERY_KEY = 'puttential-editor-v1';
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'The operation could not be completed';
export default function Editor() {
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: freshDocument(),
    future: [],
  }));
  const doc = history.present;
  const [selections, setSelections] = useState<Selection[]>([]);
  const selection = selections[selections.length - 1] ?? null;
  const [piece, setPiece] = useState(0),
    [vertices, setVertices] = useState(false);
  const [preset, setPreset] = useState<string | null>(null),
    [snap, setSnap] = useState(true);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<string[]>([]),
    [libraryChoice, setLibraryChoice] = useState('');
  const [saved, setSaved] = useState<{ id: string; revision: string; text: string } | null>(null);
  const [recovery, setRecovery] = useState<LevelDocument | null>(null),
    [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [playtest, setPlaytest] = useState<LevelDocument | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const clipboard = useRef<CopiedObject[] | null>(null);
  const inspectorPane = useRef<HTMLElement | null>(null);
  useEffect(() => {
    inspectorPane.current?.scrollTo({ top: 0 });
  }, [selection?.id, selection?.kind]);
  const dirty = JSON.stringify(doc) !== saved?.text;
  const commit = useCallback((next: LevelDocument) => {
    setHistory((h) => historyCommit(h, next));
    setError('');
    setNotice('');
  }, []);
  const apply = (fn: (d: LevelDocument) => LevelDocument) => {
    try {
      commit(fn(doc));
    } catch (cause) {
      setError(message(cause));
    }
  };
  const select = (value: Selection | null, additive = false) => {
    setSelections((current) =>
      value ? (additive ? toggleSelection(current, value) : [value]) : [],
    );
    setPiece(0);
  };
  async function refreshLibrary() {
    try {
      const response = await fetch('/api/levels');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLibrary(data.levels);
    } catch (cause) {
      setError(message(cause));
    }
  }
  useEffect(() => {
    void refreshLibrary();
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (raw) setRecovery(validateDocument(JSON.parse(raw)));
    } catch (cause) {
      setRecoveryError(message(cause));
    }
    setRecoveryChecked(true);
  }, []);
  useEffect(() => {
    if (!recoveryChecked || recovery || recoveryError) return;
    try {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(doc));
    } catch {
      setNotice('Browser recovery is unavailable. Save your course to the repository.');
    }
  }, [doc, recoveryChecked, recovery, recoveryError]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    const current = doc;
    try {
      const response = await fetch('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: current,
          revision: saved?.id === current.level.id ? saved.revision : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSaved({
        id: current.level.id,
        revision: data.revision,
        text: JSON.stringify(data.document),
      });
      setHistory((h) =>
        JSON.stringify(h.present) === JSON.stringify(current)
          ? { ...h, present: data.document }
          : h.present.level.id === current.level.id
            ? {
                ...h,
                present: {
                  ...h.present,
                  level: {
                    ...h.present.level,
                    version: Math.max(h.present.level.version, data.document.level.version),
                  },
                },
              }
            : h,
      );
      setNotice(`Saved ${data.path}`);
      await refreshLibrary();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  function replace(next: LevelDocument, stored?: { revision: string }) {
    if (dirty && !window.confirm('Replace this document? Save first to keep your current work.'))
      return;
    setHistory({ past: [], present: next, future: [] });
    select(null);
    setPreset(null);
    setError('');
    setNotice('');
    setSaved(
      stored ? { id: next.level.id, revision: stored.revision, text: JSON.stringify(next) } : null,
    );
  }
  async function openLibrary() {
    if (!libraryChoice) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/levels?id=${encodeURIComponent(libraryChoice)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      replace(validateDocument(data.document), { revision: data.revision });
      if (data.warning) setNotice(data.warning);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  const undo = () => {
    setHistory(historyUndo);
    select(null);
    setError('');
  };
  const redo = () => {
    setHistory(historyRedo);
    select(null);
    setError('');
  };
  function deleteSelection() {
    if (selection) {
      try {
        commit(removeObjects(doc, selections));
        select(null);
      } catch (cause) {
        setError(message(cause));
      }
    }
  }
  function duplicateSelection() {
    if (selection) {
      try {
        const result = pasteObjects(doc, copyObjects(doc, selections));
        commit(result.doc);
        setSelections(result.selections);
      } catch (cause) {
        setError(message(cause));
      }
    }
  }
  function copySelection() {
    if (!selection) return;
    try {
      clipboard.current = copyObjects(doc, selections);
      setError('');
      setNotice(
        `Copied ${selections.length === 1 ? selection.id : `${selections.length} objects`}. Paste to create separate objects.`,
      );
    } catch (cause) {
      setError(message(cause));
    }
  }
  function pasteSelection() {
    if (!clipboard.current) return;
    try {
      const result = pasteObjects(doc, clipboard.current);
      commit(result.doc);
      setSelections(result.selections);
      setPreset(null);
      setNotice(
        `Pasted ${result.selections.length === 1 ? result.selections[0]!.id : `${result.selections.length} objects`} at the copied position. Drag to move.`,
      );
    } catch (cause) {
      setError(message(cause));
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (playtest) return;
      const target = e.target as HTMLElement;
      if (target.matches('input,textarea,select') || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selection) {
        e.preventDefault();
        copySelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboard.current) {
        e.preventDefault();
        pasteSelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      }
      if (e.key === 'Escape') setPreset(null);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const b = doc.editor.arena.bounds;
  const categories = [
    ['staticBodies', 'Obstacles'],
    ['dynamicBodies', 'Moving bodies'],
    ['fields', 'Fields & hazards'],
  ] as const;
  return (
    <div className="site-wrap editor-wrap">
      <header className="site-header editor-header">
        <a className="brand" href="/">
          Puttential<span className="brand-dot">.</span>
        </a>
        <span className="editor-badge">Level editor</span>
        <span className="save-state">{dirty ? 'Unsaved changes' : 'Saved to repository'}</span>
        <button disabled={busy || !!playtest} onClick={() => replace(freshDocument())}>
          New
        </button>
        <button disabled={busy || !!playtest} onClick={() => file.current?.click()}>
          Import JSON
        </button>
        <button
          className="primary-button save-button"
          disabled={busy || !!playtest}
          onClick={() => void save()}
        >
          {busy ? 'Working…' : 'Save to repository'}
        </button>
      </header>
      <input
        hidden
        ref={file}
        type="file"
        accept=".json"
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (!selected) return;
          try {
            if (selected.size > 2_000_000) throw new Error('File is too large');
            replace(validateDocument(JSON.parse(await selected.text())));
          } catch (cause) {
            setError(message(cause));
          }
        }}
      />
      {recoveryError && (
        <div className="recovery-banner" role="alert">
          Browser draft could not be restored: {recoveryError} The original draft is preserved. New
          browser recovery is paused; you can still save levels to the repository.
          <button onClick={() => setRecoveryError('')}>Discard incompatible draft</button>
        </div>
      )}
      {recovery && (
        <div className="recovery-banner">
          A browser recovery draft is available: <strong>{recovery.editor.name}</strong>
          <button
            onClick={() => {
              setHistory({ past: [], present: recovery, future: [] });
              setRecovery(null);
              setSaved(null);
            }}
          >
            Restore draft
          </button>
          <button onClick={() => setRecovery(null)}>Discard recovery</button>
        </div>
      )}
      <div className="editor-notices" aria-live="polite">
        {error ? (
          <p role="alert" className="error-message">
            {error}
          </p>
        ) : notice ? (
          <p className="success-message">{notice}</p>
        ) : (
          <p>
            Select a preset or drag it onto the course. Every saved course uses the main game’s
            physics.
          </p>
        )}
      </div>
      {playtest ? (
        <Playtest document={playtest} onClose={() => setPlaytest(null)} />
      ) : (
        <>
          <div className="editor-toolbar">
            <div className="button-row">
              <button disabled={!history.past.length} onClick={undo}>
                Undo
              </button>
              <button disabled={!history.future.length} onClick={redo}>
                Redo
              </button>
              <button
                disabled={!selection || selections.some((s) => s.kind === 'goal')}
                onClick={copySelection}
              >
                Copy
              </button>
              <button disabled={!clipboard.current} onClick={pasteSelection}>
                Paste
              </button>
              <button
                disabled={!selection || selection.kind === 'goal'}
                onClick={duplicateSelection}
              >
                Duplicate
              </button>
              <button disabled={!selection || selection.kind === 'goal'} onClick={deleteSelection}>
                Delete
              </button>
              <label className="check">
                <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
                Snap ¼ unit / 15°
              </label>
            </div>
            <div className="button-row">
              <button onClick={() => select(null)}>Course properties</button>
              <button
                className="primary-button test-button"
                onClick={() => {
                  try {
                    validateDocument(doc);
                    setPlaytest(doc);
                    setError('');
                  } catch (cause) {
                    setError(message(cause));
                  }
                }}
              >
                <Icon name="play" size={16} />
                Playtest
              </button>
            </div>
          </div>
          <main className="editor-layout">
            <aside className="editor-sidebar palette">
              <h2>Objects</h2>
              <p className="muted">Drag a preset, or select and click.</p>
              {categories.map(([kind, title]) => (
                <section key={kind}>
                  <h3>{title}</h3>
                  <div className="preset-grid">
                    {presets
                      .filter((p) => p.category === kind)
                      .map((p) => (
                        <button
                          key={p.id}
                          draggable
                          aria-pressed={preset === p.id}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/puttential-preset', p.id);
                            e.dataTransfer.effectAllowed = 'copy';
                            setPreset(null);
                          }}
                          onClick={() => setPreset(preset === p.id ? null : p.id)}
                        >
                          {p.label}
                        </button>
                      ))}
                  </div>
                </section>
              ))}
              <section>
                <h3>Board</h3>
                <NumberInput
                  label="Board width"
                  value={b.maxX - b.minX}
                  onChange={(width) =>
                    apply((d) => {
                      const a = d.editor.arena.bounds,
                        c = (a.maxX + a.minX) / 2;
                      return resizeArena(d, { ...a, minX: c - width / 2, maxX: c + width / 2 });
                    })
                  }
                />
                <NumberInput
                  label="Board height"
                  value={b.maxY - b.minY}
                  onChange={(height) =>
                    apply((d) => {
                      const a = d.editor.arena.bounds,
                        c = (a.maxY + a.minY) / 2;
                      return resizeArena(d, { ...a, minY: c - height / 2, maxY: c + height / 2 });
                    })
                  }
                />
                <p className="muted">
                  Dimensions include boundary walls. Resize preserves object sizes and positions.
                  Anything outside the bounds blocks the change.
                </p>
              </section>
              <section>
                <h3>Open course</h3>
                <label className="property">
                  <span>Game starters</span>
                  <select
                    aria-label="Game starters"
                    value=""
                    onChange={(e) => {
                      try {
                        replace(starterDocument(Number(e.target.value)));
                      } catch (cause) {
                        setError(message(cause));
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose a starter…
                    </option>
                    {starterLevels.map((level, i) => (
                      <option value={i} key={level.id}>
                        {levelName(level)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="property">
                  <span>Repository library</span>
                  <select
                    aria-label="Repository library"
                    value={libraryChoice}
                    onChange={(e) => setLibraryChoice(e.target.value)}
                  >
                    <option value="">
                      {library.length ? 'Choose a level…' : 'No saved levels yet'}
                    </option>
                    {library.map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                </label>
                <div className="button-row">
                  <button disabled={!libraryChoice || busy} onClick={() => void openLibrary()}>
                    Open
                  </button>
                  <button onClick={() => void refreshLibrary()}>Refresh</button>
                </div>
              </section>
            </aside>
            <section className="editor-center">
              <div className="editor-heading">
                <div>
                  <span className="section-kicker">COURSE WORKSHOP</span>
                  <h1>{doc.editor.name}</h1>
                </div>
                <span>
                  {doc.level.dynamicBodies.length +
                    doc.level.staticBodies.length +
                    doc.level.fields.length}{' '}
                  objects
                </span>
              </div>
              <EditorCanvas
                key={doc.level.id}
                document={doc}
                selection={selection}
                selections={selections}
                onSelections={setSelections}
                onSelect={select}
                piece={piece}
                vertices={vertices}
                preset={preset}
                clearPreset={() => setPreset(null)}
                snap={snap}
                onCommit={commit}
                onError={setError}
              />
            </section>
            <aside ref={inspectorPane} className="editor-sidebar inspector">
              {selections.length > 1 ? (
                <section aria-label="Multiple selection">
                  <h2>{selections.length} objects selected</h2>
                  <p className="muted">
                    Drag a selected object to move the group. Ctrl-click toggles selection.
                    Right-drag encloses objects.
                  </p>
                  <p className="muted">
                    Ctrl+C copies · Ctrl+V pastes · Delete removes · Ctrl+Z undoes.
                  </p>
                </section>
              ) : (
                <Inspector
                  document={doc}
                  selection={selection}
                  apply={apply}
                  piece={piece}
                  setPiece={setPiece}
                  vertices={vertices}
                  setVertices={setVertices}
                  onRename={(id) => {
                    if (!selection) return;
                    try {
                      const previous = selection.id;
                      const next = edit(doc, (d) => {
                        mutableItem(d, selection).id = id;
                        if (selection.kind === 'dynamicBodies' && d.level.goal.bodyId === previous)
                          d.level.goal.bodyId = id;
                      });
                      commit(next);
                      select({ ...selection, id });
                    } catch (cause) {
                      setError(message(cause));
                    }
                  }}
                />
              )}
              <section className="object-list">
                <h3>Course objects</h3>
                <button aria-pressed={!selection} onClick={() => select(null)}>
                  Course properties
                </button>
                <button
                  aria-pressed={selection?.kind === 'goal'}
                  onClick={() => select({ kind: 'goal', id: 'goal' })}
                >
                  ⚑ Goal
                </button>
                {categories.map(([kind, title]) => (
                  <div key={kind}>
                    <h4>{title}</h4>
                    {doc.level[kind].map((object) => (
                      <button
                        key={object.id}
                        aria-pressed={selections.some((s) =>
                          sameSelection(s, { kind, id: object.id }),
                        )}
                        onClick={(e) => select({ kind, id: object.id }, e.ctrlKey || e.metaKey)}
                      >
                        {object.id}
                        {doc.editor.arena.walls.includes(object.id) ? ' · boundary' : ''}
                      </button>
                    ))}
                  </div>
                ))}
              </section>
            </aside>
          </main>
        </>
      )}
    </div>
  );
}
