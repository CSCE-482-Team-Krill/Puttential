'use client';

import { useEffect, useRef, useState } from 'react';
import { starterLevels, levelName } from '../../game';
import type { Bounds, Level } from '../../game';
import { fieldName } from '../field-label';
import { ForceToolkit, PlayButton } from '../player-controls';
import { LevelImport } from '../level-import';
import { CourseCanvas } from '../course-canvas';
import { usePuzzle } from '../puzzle';
import { Icon } from '../icon';
import type { IconName } from '../icon';
import { Modal, usePreferences } from '../modal';
import type { Panel } from '../modal';
import type { TodayPuzzleResponse } from '../../backend/types';
import { loadDailyPuzzle, saveRun } from '../api';
import type { CompletedRun } from '../puzzle';

/** Today's puzzle first; the archive lists the rest. */
/** Every tile adds the same amount to a solution's force cost. */
const TILE_COST = 1;

const PRACTICE_LEVELS = starterLevels.map((level) => ({
  level,
  day: 'Practice course',
}));

export default function Home() {
  const [daily, setDaily] = useState<TodayPuzzleResponse | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadDailyPuzzle(controller.signal)
      .then(setDaily)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the daily puzzle.');
        setDaily(null);
      });
    return () => controller.abort();
  }, []);
  if (daily === undefined)
    return (
      <main className="site-wrap" role="status">
        Loading daily courseâ€¦
      </main>
    );
  return <Game daily={daily} loadError={error} />;
}

function Game({
  daily,
  loadError,
}: {
  daily: TodayPuzzleResponse | null;
  loadError: string | null;
}) {
  const levels = daily
    ? [{ level: daily.configuration, day: daily.date }, ...PRACTICE_LEVELS]
    : PRACTICE_LEVELS;
  const [panel, setPanel] = useState<Panel>(null);
  const [level, setLevel] = useState<Level>(levels[0]!.level);
  const [importBounds, setImportBounds] = useState<Bounds | null>(null);
  function loadCourse(next: Level, bounds?: Bounds) {
    setLevel(next);
    setImportBounds(bounds ?? null);
  }
  const [preferences, setPreferences] = usePreferences();
  const puzzle = usePuzzle(level);
  const savedRuns = useRef(new WeakSet<CompletedRun>());
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  useEffect(() => {
    const run = puzzle.completedRun;
    if (!run || !daily || run.level !== daily.configuration || savedRuns.current.has(run)) return;
    savedRuns.current.add(run);
    let active = true;
    setSaveStatus('Saving runâ€¦');
    void saveRun(daily.id, run)
      .then(() => {
        if (active)
          setSaveStatus(run.result.solved ? 'Attempt and solution saved.' : 'Attempt saved.');
      })
      .catch(() => {
        if (active)
          setSaveStatus('Your run could not be fully saved. Please check the connection.');
      });
    return () => {
      active = false;
    };
  }, [daily, puzzle.completedRun]);
  useEffect(() => {
    setSaveStatus(null);
  }, [level, puzzle.attempts]);
  const nav: { name: Exclude<Panel, 'result' | null>; label: string; icon: IconName }[] = [
    { name: 'archive', label: 'Calendar', icon: 'calendar' },
    { name: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
    { name: 'settings', label: 'Settings', icon: 'settings' },
    { name: 'stats', label: 'Profile', icon: 'profile' },
    { name: 'help', label: 'Help', icon: 'help' },
  ];

  useEffect(() => {
    if (puzzle.result !== null) setPanel('result');
  }, [puzzle.result]);

  const placedTiles = Object.values(puzzle.draft).filter((field) => field.enabled).length;
  const levelIndex = levels.findIndex((entry) => entry.level === level);
  const isDaily = daily?.configuration === level;
  const status =
    puzzle.mode === 'error'
      ? (puzzle.error ?? 'Could not load course')
      : puzzle.mode === 'loading'
        ? 'Loading courseâ€¦'
        : puzzle.mode === 'running'
          ? 'Simulation running'
          : puzzle.mode === 'done'
            ? 'Run finished'
            : placedTiles > 0
              ? 'Drag fields on the course to move them.'
              : 'Choose a force block to get started.';

  return (
    <div className={`site-wrap ${preferences.reducedMotion ? 'reduce-motion' : ''}`}>
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            loadCourse(levels[0]!.level);
            setPanel(null);
          }}
          aria-label="Puttential home"
        >
          <span className="brand-mark">
            <span className="brand-ball" />
            <span className="brand-flag" />
          </span>
          <span>
            Puttential<span className="brand-dot">.</span>
          </span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.name}
              className={`nav-button ${panel === item.name ? 'active' : ''}`}
              onClick={() => setPanel(item.name)}
              aria-expanded={panel === item.name}
            >
              <Icon name={item.icon} size={23} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="dashboard">
        {loadError && (
          <p className="course-details" role="status">
            {loadError} You can play a practice course below. Practice runs are not saved.
          </p>
        )}
        {saveStatus && (
          <p className="demo-note" role="status">
            {saveStatus}
          </p>
        )}
        <LevelImport onLoad={loadCourse} />
        <div className="game-layout">
          <section className="play-column" aria-labelledby="course-title">
            <div className="course-stage">
              <div className="course-heading">
                <span className="challenge-label">
                  <Icon name="calendar" size={16} />{' '}
                  {levelIndex < 0
                    ? 'Local course'
                    : isDaily
                      ? 'Daily challenge'
                      : 'Practice challenge'}{' '}
                  {isDaily && <b>{daily.date}</b>}
                </span>
                <span className={`course-status ${puzzle.mode === 'running' ? 'running' : ''}`}>
                  <i />{' '}
                  {puzzle.mode === 'setup'
                    ? 'Planning'
                    : puzzle.mode === 'running'
                      ? 'In motion'
                      : puzzle.mode === 'done'
                        ? 'Finished'
                        : puzzle.mode === 'error'
                          ? 'Error'
                          : 'Loading'}
                </span>
              </div>
              <div className="course">
                <div className="course-grid" />
                <CourseCanvas
                  {...(importBounds
                    ? {
                        camera: {
                          bounds: importBounds,
                          zoom: 1,
                          center: {
                            x: (importBounds.minX + importBounds.maxX) / 2,
                            y: (importBounds.minY + importBounds.maxY) / 2,
                          },
                        },
                      }
                    : {})}
                  level={level}
                  goalRef={puzzle.goalRef}
                  frameRef={puzzle.frameRef}
                  draft={puzzle.draft}
                  mode={puzzle.mode}
                  trail={preferences.showPreview ? puzzle.trail : []}
                  onMoveField={puzzle.moveField}
                />
              </div>
            </div>

            <div className="course-details">
              <div className="details-heading">
                <div>
                  <span className="section-kicker">
                    {levelIndex < 0
                      ? 'LOCAL COURSE'
                      : isDaily
                        ? "TODAY'S COURSE"
                        : 'PRACTICE COURSE'}
                  </span>
                  <h1 id="course-title">{levelName(level)}</h1>
                  <p>One course. Your own way to the goal.</p>
                </div>
                <button
                  className="how-button"
                  onClick={() => setPanel('help')}
                  aria-label="How to play"
                >
                  <Icon name="help" size={17} />
                  <span>How to play</span>
                </button>
              </div>
              <div className="run-controls">
                <dl className="run-metrics" aria-label="Current solution">
                  <div>
                    <dt>Force cost</dt>
                    <dd>
                      {placedTiles * TILE_COST}
                      <small>pt</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Blocks placed</dt>
                    <dd>
                      {placedTiles}
                      <small>/ {level.fields.length}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Attempts</dt>
                    <dd>{puzzle.attempts}</dd>
                  </div>
                </dl>
                <div className="run-actions">
                  <button
                    className="text-button"
                    disabled={puzzle.mode === 'loading' || puzzle.mode === 'error'}
                    onClick={puzzle.resetLayout}
                  >
                    <Icon name="reset" size={17} /> Reset layout
                  </button>
                  <PlayButton puzzle={puzzle} />
                </div>
              </div>
              <div className="game-toolbar">
                <div className="course-legend">
                  <span>
                    <i className="legend-ball" /> {fieldName(level.goal.bodyId)}
                  </span>
                  <span>
                    <i className="legend-field" /> Force field
                  </span>
                  <span>
                    <i className="legend-goal" /> Goal
                  </span>
                </div>
                <span className="demo-note" role="status">
                  {status}
                </span>
              </div>
            </div>
          </section>

          <aside className="control-column" aria-labelledby="toolkit-title">
            <div className="control-heading">
              <span className="section-kicker">YOUR TOOLKIT</span>
              <div className="toolkit-title">
                <h2 id="toolkit-title">Force blocks</h2>
                <span className="inventory-count">{level.fields.length}</span>
              </div>
              <p>Choose a block, then drag its field into position on the course.</p>
            </div>
            <ForceToolkit level={level} puzzle={puzzle} />
            <p className="toolkit-note">
              Every block costs 1 point. Use fewer to improve your solution.
            </p>
            <div className="tip-card">
              <span className="tip-icon">âœ¦</span>
              <div>
                <strong>A little foresight</strong>
                <p>
                  The dotted path previews the first second of your run. Adjust your fields before
                  pressing Play.
                </p>
              </div>
            </div>
            <div className="toolkit-footer">
              <Icon name="trophy" size={18} />
              <span>Small moves. Better solutions.</span>
            </div>
          </aside>
        </div>
      </main>
      {panel && (
        <Modal
          key={panel}
          panel={panel}
          close={() => setPanel(null)}
          preferences={preferences}
          setPreferences={setPreferences}
          result={puzzle.result}
          levels={levels}
          currentLevel={level}
          chooseLevel={loadCourse}
          tileCost={TILE_COST}
        />
      )}
    </div>
  );
}
