'use client';

import { useRef, useState } from 'react';
import type { LevelDocument } from '../../game';
import { Icon } from '../../frontend/icon';
import { useDialog } from '../../frontend/modal';
import { edit, freshDocument, historyCommit, historyUndo, presets } from '../model';
import type { DraftDocument, History, Selection } from '../model';
import type { EditorPersistence } from '../persistence';
import { EditorCanvas } from './editor-canvas';
import { NumberInput } from './inspector';
import { Playtest } from './playtest';

const SEEN_KEY = 'puttential-editor-tutorial-v1';

export function shouldOpenEditorTutorial() {
  try {
    // Match the game tutorial: automated browsers opt in explicitly.
    return !navigator.webdriver && localStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}

export function markEditorTutorialSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'seen');
  } catch {
    // Tutorial remains available from the editor header without browser storage.
  }
}

const STEPS = [
  {
    label: 'Course',
    title: 'Every course starts with a ball and a goal',
    description:
      'The ball is on the left; the flag marks the goal on the right. Your puzzle should help the ball reach the goal and stay there for 1 second.',
    task: 'Try dragging the ball or the goal. This is a practice course, so explore freely.',
    tip: 'The real editor has objects on the left, your course in the middle, and properties on the right.',
  },
  {
    label: 'Build',
    title: 'Place your first obstacle',
    description:
      'Obstacles shape the route. Choose Rectangle, then click an empty spot on the course. You can also drag the preset onto the course.',
    task: 'Add a rectangle above or below the ball’s path.',
    tip: 'In the editor, the Objects panel also has moving bodies, hazards, and portals.',
  },
  {
    label: 'Adjust',
    title: 'Make it fit your idea',
    description:
      'Select an object to see its properties. Drag it to move it, use the square handle to resize it, or the round handle to rotate it.',
    task: 'Change your rectangle’s width, height, or rotation using the controls on the right.',
    tip: 'Changes apply when you press Enter or leave a number field. Undo lets you experiment.',
  },
  {
    label: 'Forces',
    title: 'Give the player a force tile',
    description:
      'A repulsor pushes the ball away from its center. Choose Repulsor, then place it just to the left of the ball.',
    task: 'Add a repulsor. In playtest, turn its tile ON and position it to push the ball toward the goal.',
    tip: 'New force tiles start OFF. Players choose which tiles to enable and where to place them.',
  },
  {
    label: 'Test',
    title: 'Try your course as a player',
    description:
      'Open Playtest, turn the force tile ON, then press Play. Watch the result and choose Return to editor when you’re ready to adjust the course.',
    task: 'Open Playtest and try a shot. You don’t need to solve this practice course to continue.',
    tip: 'Playtest uses the game’s physics. Moving tiles during a test leaves your authored course unchanged.',
  },
  {
    label: 'Save',
    title: 'You’re ready to build a puzzle',
    description:
      'Start small: one ball, one goal, a clear route, and a few force tiles. Playtest often and make sure the course can be solved.',
    task: 'Choose Start building to return to your course. Your work is exactly where you left it.',
    tip: 'Replay this walkthrough any time using Tutorial in the editor header.',
  },
] as const;

export function EditorTutorial({
  close,
  labels,
  canPublish,
}: {
  close: () => void;
  labels: EditorPersistence['labels'];
  canPublish: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialog(dialogRef, close);
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: freshDocument(),
    future: [],
  }));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [adjustmentStart, setAdjustmentStart] = useState('');
  const doc = history.present;
  const obstacle = doc.level.staticBodies.find((body) => !doc.editor.arena.walls.includes(body.id));
  const shape = obstacle?.pieces[0]?.shape;
  const force = doc.level.fields[0];
  const current = STEPS[step]!;
  const adjustment = JSON.stringify(obstacle);
  const complete =
    step === 1
      ? !!obstacle
      : step === 2
        ? !!obstacle && adjustment !== adjustmentStart
        : step === 3
          ? !!force
          : step === 4
            ? tested
            : true;

  function commit(next: LevelDocument, source?: LevelDocument) {
    setHistory((previous) =>
      source && previous.present !== source ? previous : historyCommit(previous, next),
    );
    setError('');
  }

  function changeObstacle(change: (body: DraftDocument['level']['staticBodies'][number]) => void) {
    if (!obstacle) return;
    try {
      commit(
        edit(doc, (draft) => {
          const body = draft.level.staticBodies.find((item) => item.id === obstacle.id)!;
          change(body);
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Try another value.');
    }
  }

  function go(next: number) {
    setPreset(null);
    setError('');
    setStep(next);
    if (next === 2) {
      setAdjustmentStart(adjustment);
      setSelection(obstacle ? { kind: 'staticBodies', id: obstacle.id } : null);
    }
    if (next === 3 && force) setSelection({ kind: 'fields', id: force.id });
  }

  const palettePreset = presets.find((item) =>
    step === 3 ? item.id === 'fields:repulsor' : item.id === 'staticBodies:rectangle',
  )!;
  const showPalette = step === 1 || step === 3;
  const finished = step === STEPS.length - 1;

  return (
    <div className="editor-tutorial-backdrop">
      <section
        ref={dialogRef}
        className="editor-tutorial"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-tutorial-title"
        aria-describedby="editor-tutorial-description"
        tabIndex={-1}
      >
        <header className="editor-tutorial-header">
          <div>
            <span className="section-kicker">QUICK EDITOR TUTORIAL · HANDS ON</span>
            <h2 id="editor-tutorial-title">Build your first course</h2>
          </div>
          <button onClick={close} aria-label="Close editor tutorial">
            <Icon name="close" />
          </button>
        </header>
        <div className="editor-tutorial-body">
          <ol className="editor-tutorial-steps" aria-label="Editor tutorial steps">
            {STEPS.map((item, index) => (
              <li
                key={item.label}
                className={index === step ? 'active' : index < step ? 'complete' : ''}
                aria-current={index === step ? 'step' : undefined}
              >
                <span aria-hidden="true">{index < step ? '✓' : index + 1}</span>
                {item.label}
              </li>
            ))}
          </ol>
          <div className="editor-tutorial-instruction" aria-live="polite" aria-atomic="true">
            <span className="section-kicker">
              STEP {step + 1} OF {STEPS.length}
            </span>
            <h3>{current.title}</h3>
            <p id="editor-tutorial-description">{current.description}</p>
          </div>
          {finished ? (
            <div className="editor-tutorial-save">
              <article>
                <Icon name="editor" size={24} />
                <h4>Name your course</h4>
                <p>Open Course properties. Set a course name and a unique Level ID / filename.</p>
              </article>
              <article>
                <Icon name="reset" size={24} />
                <h4>{labels.save}</h4>
                <p>
                  Use {labels.save} in the header. Reopen it later from {labels.library}.
                </p>
              </article>
              <article>
                <Icon name={canPublish ? 'community' : 'arrow'} size={24} />
                <h4>{canPublish ? 'Share your puzzle' : 'Keep a portable copy'}</h4>
                <p>
                  {canPublish
                    ? 'Solve your map in Playtest to unlock publishing to Community. Export JSON also downloads a portable copy.'
                    : 'Export JSON downloads your course. Import JSON opens it again. Saving to the repository does not publish it.'}
                </p>
              </article>
            </div>
          ) : testing ? (
            <Playtest
              document={doc}
              onClose={() => {
                setTesting(false);
                setTested(true);
              }}
            />
          ) : (
            <div className="editor-tutorial-workspace">
              <div className="editor-tutorial-board">
                <div className="editor-tutorial-tools">
                  <span className="editor-tutorial-practice">PRACTICE COURSE</span>
                  <button
                    disabled={!history.past.length}
                    onClick={() => {
                      setHistory(historyUndo);
                      setSelection(null);
                    }}
                  >
                    Undo
                  </button>
                  {step === 4 && (
                    <button className="primary-button" onClick={() => setTesting(true)}>
                      <Icon name="play" size={16} /> Open Playtest
                    </button>
                  )}
                </div>
                <EditorCanvas
                  document={doc}
                  selection={selection}
                  selections={selection ? [selection] : []}
                  onSelections={(selections) => setSelection(selections.at(-1) ?? null)}
                  onSelect={setSelection}
                  piece={0}
                  vertices={false}
                  preset={preset}
                  clearPreset={() => setPreset(null)}
                  snap
                  onCommit={commit}
                  onError={setError}
                />
              </div>
              <aside className="editor-tutorial-properties" aria-label="Practice controls">
                {showPalette ? (
                  <>
                    <span className="section-kicker">1. CHOOSE AN OBJECT</span>
                    <button
                      className="editor-tutorial-preset"
                      draggable
                      aria-pressed={preset === palettePreset.id}
                      onClick={() =>
                        setPreset(preset === palettePreset.id ? null : palettePreset.id)
                      }
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/puttential-preset',
                          palettePreset.id,
                        );
                        event.dataTransfer.effectAllowed = 'copy';
                        setPreset(null);
                      }}
                    >
                      {step === 3 ? 'Repulsor' : 'Rectangle'}
                    </button>
                    <p>
                      {preset
                        ? '2. Click the course to place it.'
                        : 'Click to choose, or drag onto the course.'}
                    </p>
                  </>
                ) : step === 2 && obstacle ? (
                  <>
                    <span className="section-kicker">OBJECT PROPERTIES</span>
                    <button onClick={() => setSelection({ kind: 'staticBodies', id: obstacle.id })}>
                      Select rectangle
                    </button>
                    {shape?.kind === 'rectangle' && (
                      <>
                        <NumberInput
                          label="Width"
                          value={shape.width}
                          onChange={(width) =>
                            changeObstacle((body) => {
                              const outline = body.pieces[0]!.shape;
                              if (outline.kind === 'rectangle') outline.width = width;
                            })
                          }
                        />
                        <NumberInput
                          label="Height"
                          value={shape.height}
                          onChange={(height) =>
                            changeObstacle((body) => {
                              const outline = body.pieces[0]!.shape;
                              if (outline.kind === 'rectangle') outline.height = height;
                            })
                          }
                        />
                      </>
                    )}
                    <NumberInput
                      label="Rotation (degrees)"
                      value={(obstacle.angle * 180) / Math.PI}
                      step={15}
                      onChange={(angle) =>
                        changeObstacle((body) => {
                          body.angle = (angle * Math.PI) / 180;
                        })
                      }
                    />
                  </>
                ) : (
                  <>
                    <span className="section-kicker">
                      {step === 4 ? 'TEST & REFINE' : 'BALL → GOAL'}
                    </span>
                    <p>
                      {step === 4
                        ? 'Playtest switches from building to playing. Return here to keep editing.'
                        : 'Drag to move. The ball must stay inside the goal until the goal fills.'}
                    </p>
                    {step === 0 && (
                      <button onClick={() => setSelection({ kind: 'goal', id: 'goal' })}>
                        Select goal
                      </button>
                    )}
                  </>
                )}
                <div className="editor-tutorial-tip">
                  <Icon name="help" size={18} />
                  <p>{current.tip}</p>
                </div>
              </aside>
            </div>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <p
            className={`editor-tutorial-task ${complete && step > 0 && !finished ? 'complete' : ''}`}
            role="status"
          >
            {complete && step > 0 && !finished
              ? '✓ Nice! Continue when you’re ready.'
              : current.task}
          </p>
        </div>
        <footer className="editor-tutorial-footer">
          <span>Your course is safe. Practice changes are never saved.</span>
          <div className="button-row">
            <button className="text-button" onClick={close}>
              Skip tutorial
            </button>
            {step > 0 && (
              <button disabled={testing} onClick={() => go(step - 1)}>
                Back
              </button>
            )}
            {!complete && !testing && <button onClick={() => go(step + 1)}>Skip step</button>}
            <button
              className="primary-button"
              disabled={!complete || testing}
              onClick={() => (finished ? close() : go(step + 1))}
            >
              {finished ? 'Start building' : 'Next'} <Icon name="arrow" size={17} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
