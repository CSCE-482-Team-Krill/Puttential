'use client';

import { useEffect, useRef, useState } from 'react';
import {
  isCourseObject,
  polygonBounds,
  shapePolygon,
  transformPolygon,
  tutorialLevel,
} from '../game';
import type { Level, Vec2 } from '../game';
import { CourseCanvas, toCanvas } from './course-canvas';
import type { View } from './course-canvas';
import { deliveredEngine } from './engine-adapter';
import { Icon } from './icon';
import { useDialog } from './modal';
import { ForceToolkit, PlayButton } from './player-controls';
import { usePuzzle } from './puzzle';
import type { Draft } from './puzzle';
// Also styles the Help panel's "Watch the tutorial" button; page.tsx always loads this module.
import './tutorial.css';

const SEEN_KEY = 'puttential-tutorial-v1';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    // Without storage we cannot remember a visit; don't show it on every load.
    return true;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'seen');
  } catch {
    // The walkthrough stays available from Help.
  }
}

/** Opens on a first visit. Automated browsers skip it so tests reach the course; Help replays it. */
export function shouldOpenTutorial(): boolean {
  return !navigator.webdriver && !tutorialSeen();
}

// The scripted shot: switch the launcher on where it is parked, drag it behind the ball, play.
const LAUNCHER = 'launch-repulsor';
const TARGET: Vec2 = { x: -8.5, y: -3 };
const INTRO_MS = 2200;
const TOGGLE_MS = 1600;
const DRAG_MS = 2400;

type Phase = 'intro' | 'toggle' | 'drag' | 'play' | 'done';
type Cursor = { at: Vec2; pressed: boolean };

const STEPS: { phase: Phase; label: string }[] = [
  { phase: 'toggle', label: 'Toggle' },
  { phase: 'drag', label: 'Drag' },
  { phase: 'play', label: 'Play' },
  { phase: 'done', label: 'Win' },
];
const ORDER: Phase[] = ['intro', 'toggle', 'drag', 'play', 'done'];

const TUTORIAL_CAPTIONS = [
  'The repulsor pushes the ball away from its center…',
  '…the portal sends it to the top lane at the same speed…',
  '…water drags on it and slows it down…',
  '…and it arrives inside the goal area. After staying there for 1 second, you win.',
];

const LABELS: Partial<Record<string, string>> = {
  portal: 'Portal',
  water: 'Water',
  lava: 'Lava',
};

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function drawOverlay(
  context: CanvasRenderingContext2D,
  view: View,
  level: Level,
  cursor: Cursor | null,
) {
  context.save();
  context.font = '600 12px "Noto Sans", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const field of level.fields) {
    const label = LABELS[field.force.kind];
    if (!label || !isCourseObject(field.force)) continue;
    const bounds = polygonBounds(
      transformPolygon(shapePolygon(field.shape), field.position, field.angle),
    );
    const at = toCanvas(view, { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY });
    const width = context.measureText(label).width + 12;
    context.fillStyle = '#2d3a3ad9';
    context.beginPath();
    context.roundRect(at.x - width / 2, at.y + 6, width, 20, 10);
    context.fill();
    context.fillStyle = '#ffffff';
    context.fillText(label, at.x, at.y + 16);
  }
  if (cursor) {
    const at = toCanvas(view, cursor.at);
    context.lineWidth = 3;
    context.strokeStyle = '#2d3a3a';
    context.fillStyle = cursor.pressed ? '#ffd166' : '#ffffffcc';
    context.beginPath();
    context.arc(at.x, at.y, cursor.pressed ? 11 : 14, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (cursor.pressed) {
      context.strokeStyle = '#ffd16699';
      context.lineWidth = 6;
      context.beginPath();
      context.arc(at.x, at.y, 20, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.restore();
}

export function Tutorial({ close, reducedMotion }: { close: () => void; reducedMotion: boolean }) {
  const level = tutorialLevel;
  const puzzle = usePuzzle(level, { adapter: deliveredEngine });
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const dialogRef = useRef<HTMLElement>(null);
  useDialog(dialogRef, close);
  const cursorRef = useRef<Cursor | null>(null);
  const draftOverrideRef = useRef<Draft | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [runStage, setRunStage] = useState(0);
  const [replay, setReplay] = useState(0);
  const [free, setFree] = useState(false);
  const loaded = puzzle.mode !== 'loading' && puzzle.mode !== 'error';

  // Scripted setup and Play. Reduced motion jumps instead of animating the drag.
  useEffect(() => {
    if (!loaded || free) return;
    const park = level.fields.find((f) => f.id === LAUNCHER)!.position;
    const instant = reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    const later = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
    let frame = 0;
    setPhase('intro');
    setRunStage(0);
    later(INTRO_MS, () => setPhase('toggle'));
    later(INTRO_MS + TOGGLE_MS / 2, () => puzzleRef.current.toggleField(LAUNCHER));
    later(INTRO_MS + TOGGLE_MS, () => {
      setPhase('drag');
      const start = performance.now();
      let dropped = false;
      // The field follows the cursor through a canvas-only override; the layout updates once on drop.
      frame = requestAnimationFrame(function drag(now) {
        const k = Math.min(1, (now - start) / DRAG_MS);
        // Hover, grab, move, then hold on the target so the preview arrow can be read.
        const move = instant ? 1 : ease(Math.min(1, Math.max(0, (k - 0.15) / 0.55)));
        const at = lerp(park, TARGET, move);
        cursorRef.current = { at, pressed: k > 0.12 && k < 0.75 };
        if (move < 1) {
          const draft = puzzleRef.current.draft;
          draftOverrideRef.current = {
            ...draft,
            [LAUNCHER]: { ...draft[LAUNCHER]!, position: at },
          };
        } else if (!dropped) {
          dropped = true;
          puzzleRef.current.moveField(LAUNCHER, TARGET);
          draftOverrideRef.current = null;
        }
        if (k < 1) {
          frame = requestAnimationFrame(drag);
          return;
        }
        cursorRef.current = null;
        setPhase('play');
        puzzleRef.current.play();
      });
    });
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      cancelAnimationFrame(frame);
      cursorRef.current = null;
      draftOverrideRef.current = null;
    };
  }, [loaded, free, replay, level, reducedMotion]);

  // Captions advance with the ball and never step backwards.
  useEffect(() => {
    if (puzzle.mode !== 'running') return;
    let shown = 0;
    let frame = requestAnimationFrame(function watch() {
      const state = puzzle.frameRef.current;
      const ball = state?.bodies.find((b) => b.id === level.goal.bodyId);
      const stage = puzzle.goalRef.current.inside
        ? 3
        : ball?.submerged
          ? 2
          : ball?.teleporting
            ? 1
            : 0;
      if (stage > shown) {
        shown = stage;
        setRunStage((current) => Math.max(current, stage));
      }
      frame = requestAnimationFrame(watch);
    });
    return () => cancelAnimationFrame(frame);
  }, [puzzle.mode, puzzle.frameRef, puzzle.goalRef, level]);

  useEffect(() => {
    if (puzzle.mode === 'done' && !free) setPhase('done');
  }, [puzzle.mode, free]);

  function restart(freePlay: boolean) {
    puzzle.rewind();
    puzzle.resetLayout();
    cursorRef.current = null;
    setRunStage(0);
    setFree(freePlay);
    if (!freePlay) setReplay((n) => n + 1);
  }

  const solved = puzzle.result?.solved === true;
  // Scripted captions accumulate so earlier lines stay readable; free play shows one line.
  const log: string[] = free
    ? [
        puzzle.mode === 'running'
          ? TUTORIAL_CAPTIONS[runStage]!
          : puzzle.mode === 'done'
            ? solved
              ? `Solved in ${puzzle.result!.seconds.toFixed(2)}s. Try a different route, or start playing.`
              : puzzle.result?.failure === 'lava'
                ? 'Lava burns the ball. Choose Try again and aim for the portal.'
                : puzzle.result?.failure === 'water'
                  ? 'The ball stopped in water and sank. Give it more speed.'
                  : 'The ball stopped short. Choose Try again and move the block.'
            : 'Your turn: turn the block on, drag its field anywhere, then press Play button.',
      ]
    : [
        'Goal: get the ball into the flag area and keep it there.',
        ...(phase === 'intro' ? [] : ['Enable a force block from your toolkit.']),
        ...(phase === 'intro' || phase === 'toggle'
          ? []
          : [
              'Drag its field onto the course. The arrow preview shows where the ball will be going.',
            ]),
        ...(phase === 'play' || phase === 'done' ? TUTORIAL_CAPTIONS.slice(0, runStage + 1) : []),
        ...(phase === 'done'
          ? [
              solved
                ? 'Solved! Use as few force fields as you can: fewer points rank higher on the daily leaderboard.'
                : 'The run finished. Watch again to see the full shot.',
            ]
          : []),
      ];
  useEffect(() => {
    const list = logRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [log.length, free]);
  const current = ORDER.indexOf(phase);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="modal modal-tutorial"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-log"
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">QUICK TUTORIAL</span>
            <h2 id="tutorial-title">{free ? 'Try it yourself' : 'How to play'}</h2>
          </div>
          <button className="icon-button close-button" onClick={close} aria-label="Close tutorial">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body tutorial-body">
          {!free && (
            <ol className="tutorial-steps" aria-label="Tutorial steps">
              {STEPS.map((step, index) => {
                const position = ORDER.indexOf(step.phase);
                return (
                  <li
                    key={step.phase}
                    className={
                      position === current ? 'active' : position < current ? 'complete' : ''
                    }
                    aria-current={position === current ? 'step' : undefined}
                  >
                    <span aria-hidden="true">{index + 1}</span>
                    {step.label}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="tutorial-stage">
            <div className="course tutorial-course">
              <CourseCanvas
                level={level}
                goalRef={puzzle.goalRef}
                frameRef={puzzle.frameRef}
                draft={puzzle.draft}
                draftOverride={draftOverrideRef}
                mode={puzzle.mode}
                trail={puzzle.trail}
                onMoveField={puzzle.moveField}
                onSelectField={puzzle.selectField}
                selectedField={puzzle.selectedField}
                editingLocked={!free}
                overlay={(context, view) => drawOverlay(context, view, level, cursorRef.current)}
              />
            </div>
            <div className={`tutorial-toolkit ${!free && phase === 'toggle' ? 'pulse' : ''}`}>
              <span className="section-kicker">YOUR TOOLKIT</span>
              <ForceToolkit level={level} puzzle={puzzle} locked={!free} />
              {free && (
                <div className="tutorial-run">
                  <PlayButton puzzle={puzzle} />
                  <button
                    className="text-button"
                    disabled={puzzle.mode !== 'setup'}
                    onClick={puzzle.resetLayout}
                  >
                    <Icon name="reset" size={17} /> Reset layout
                  </button>
                </div>
              )}
              <ol className="tutorial-log" id="tutorial-log" ref={logRef} aria-live="polite">
                {log.map((line, index) => (
                  <li
                    key={`${free}-${index}`}
                    className={index === log.length - 1 ? 'current' : ''}
                  >
                    {line}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="tutorial-actions">
            {!free && phase !== 'done' ? (
              <button className="text-button" onClick={close}>
                Skip tutorial
              </button>
            ) : (
              <>
                <button className="text-button" onClick={() => restart(false)}>
                  <Icon name="reset" size={17} /> Watch again
                </button>
                {!free && (
                  <button className="text-button" onClick={() => restart(true)}>
                    Try it yourself
                  </button>
                )}
                <button className="primary-button" onClick={close}>
                  Start playing <Icon name="arrow" size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
