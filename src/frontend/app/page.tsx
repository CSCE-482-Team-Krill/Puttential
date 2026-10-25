'use client';

import { useEffect, useRef, useState } from 'react';
import { starterLevels, levelName } from '../../game';
import type { Bounds, Level } from '../../game';
import { ForceToolkit, PlayButton } from '../player-controls';
import { LevelImport } from '../level-import';
import { CourseCanvas } from '../course-canvas';
import { usePuzzle } from '../puzzle';
import { Icon } from '../icon';
import { BrandLogo } from '../brand-logo';
import type { IconName } from '../icon';
import { Modal, usePreferences } from '../modal';
import type { Panel } from '../modal';
import type { TodayPuzzleResponse } from '../../backend/types';
import { loadDailyPuzzle, saveRun } from '../api';
import type { CompletedRun } from '../puzzle';
import { selectableFields, selectedFieldCount, TILE_COST } from '../score-display';

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
      <div className="site-wrap loading-shell">
        <header className="site-header">
          <span className="brand">
            <BrandLogo />
          </span>
        </header>
        <main className="dashboard">
          <div className="loading-region" role="status">
            Loading today's course…
          </div>
        </main>
      </div>
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
    setSaveStatus('Saving run…');
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

  const placedTiles = selectedFieldCount(level, puzzle.draft);
  const inventoryCount = selectableFields(level).length;
  const ready = puzzle.mode !== 'loading' && puzzle.mode !== 'error';
  const levelIndex = levels.findIndex((entry) => entry.level === level);
  const isDaily = daily?.configuration === level;
  const status =
    puzzle.mode === 'error'
      ? (puzzle.error ?? 'Could not load course')
      : puzzle.mode === 'loading'
        ? 'Loading course…'
        : puzzle.mode === 'running'
          ? 'Simulation running'
          : puzzle.mode === 'done'
            ? 'Run finished'
            : placedTiles > 0
              ? 'Drag fields on the course to move them.'
              : inventoryCount === 0
                ? 'No blocks to place. Press Play to watch the course.'
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
          <BrandLogo />
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.name}
              className={`nav-button ${panel === item.name ? 'active' : ''}`}
              onClick={() => setPanel(item.name)}
              aria-expanded={panel === item.name}
              aria-label={item.label}
              title={item.label}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="dashboard">
        {loadError && (
          <p className="api-notice" role="status">
            Today's puzzle is unavailable. Practice courses still work; those runs aren't saved.
          </p>
        )}
        <div className="game-layout">
          <div className="course-meta course-heading">
            <div className="course-identity">
              <h1 id="course-title">{levelName(level)}</h1>
              <span className="challenge-label">
                <Icon name="calendar" size={16} />{' '}
                {levelIndex < 0
                  ? 'Local course'
                  : isDaily
                    ? 'Daily challenge'
                    : 'Practice challenge'}{' '}
                {isDaily && <b>{daily?.date}</b>}
              </span>
            </div>
            <span className={`course-status ${puzzle.mode === 'running' ? 'running' : ''}`}>
              <i aria-hidden="true" />{' '}
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
          <section className="course-stage" aria-labelledby="course-title">
            <div className="course">
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
          </section>
          <aside className="control-column" aria-labelledby="toolkit-title">
            <div className="control-heading">
              <span className="section-kicker">YOUR TOOLKIT</span>
              <div className="toolkit-title">
                <h2 id="toolkit-title">Force blocks</h2>
                <span
                  className="inventory-count"
                  aria-label={`${inventoryCount} force blocks available`}
                >
                  {inventoryCount}
                </span>
              </div>
              <p>Turn a block ON, then drag its field on the course.</p>
            </div>
            <ForceToolkit level={level} puzzle={puzzle} />
            <p className="toolkit-note">
              Every active block adds {TILE_COST} point. Use fewer to improve your solution.
            </p>
            <section className="run-controls" aria-label="Run controls">
              <PlayButton puzzle={puzzle} />
              <button className="text-button" disabled={!ready} onClick={puzzle.resetLayout}>
                <Icon name="reset" size={17} /> Reset layout
              </button>
            </section>
          </aside>
          <span className="sr-only" role="status">
            {status}
          </span>
          {saveStatus && (
            <p className="save-status sr-only" role="status">
              {saveStatus}
            </p>
          )}
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
          courseImport={
            <LevelImport
              onLoad={(nextLevel, bounds) => {
                loadCourse(nextLevel, bounds);
                setPanel(null);
              }}
            />
          }
        />
      )}
    </div>
  );
}
