'use client';

import { Icon } from '../../../src/frontend/icon';
import type { IconName } from '../../../src/frontend/icon';
import { fieldName } from '../../../src/frontend/field-label';
import { ForceToolkit, PlayButton } from '../../../src/frontend/player-controls';
import { LevelImport } from '../../../src/frontend/level-import';
import { useEffect, useState } from 'react';
import { starterLevels, levelName } from '@game';
import type { Bounds, Level } from '@game';
import { CourseCanvas } from './course-canvas';
import { usePuzzle } from './puzzle';
import type { RunResult } from './puzzle';

type Panel = 'archive' | 'stats' | 'leaderboard' | 'settings' | 'help' | 'result' | null;
const rankings = [
  { rank: '01', name: 'birdbrain', force: 2, tiles: 1, time: '4.82s' },
  { rank: '02', name: 'physwiz', force: 3, tiles: 2, time: '3.14s' },
  { rank: '03', name: 'krillking', force: 3, tiles: 2, time: '5.26s' },
  { rank: '•••', name: '', force: '', tiles: '', time: '' },
  { rank: '218', name: 'You', force: 5, tiles: 3, time: '6.31s' },
];

/** Today's puzzle first; the archive lists the rest. */
/** Every tile adds the same amount to a solution's force cost. */
const TILE_COST = 1;

const LEVELS = starterLevels.map((level, index) => ({
  level,
  day: ['Today', 'Yesterday', 'Sep 20', 'Sep 19', 'Sep 18'][index]!,
}));

function Modal({
  panel,
  close,
  reducedMotion,
  setReducedMotion,
  result,
  currentLevel,
  chooseLevel,
}: {
  panel: Exclude<Panel, null>;
  close: () => void;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  result: RunResult | null;
  currentLevel: Level;
  chooseLevel: (level: Level) => void;
}) {
  const [sound, setSound] = useState(true);
  const titles: Record<Exclude<Panel, null>, string> = {
    archive: 'Puzzle archive',
    stats: 'Your stats',
    leaderboard: 'Leaderboard',
    settings: 'Settings',
    help: 'How to play',
    result: result?.solved === false ? 'So close' : 'Nice work!',
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">PUTTENTIAL</span>
            <h2 id="modal-title">{titles[panel]}</h2>
          </div>
          <button className="icon-button close-button" onClick={close} aria-label="Close panel">
            <Icon name="close" />
          </button>
        </div>
        {panel === 'archive' && (
          <div className="modal-body">
            <p className="muted">Past puzzles are ready whenever you are.</p>
            <div className="archive-list">
              {LEVELS.map(({ level, day }, index) => (
                <button
                  className="archive-row"
                  key={level.id}
                  onClick={() => {
                    chooseLevel(level);
                    close();
                  }}
                >
                  <span className="archive-number">#{126 - index}</span>
                  <span>
                    {day} · {levelName(level)}
                  </span>
                  <span className="row-status">{level === currentLevel ? 'Playing' : 'Play'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {panel === 'stats' && (
          <div className="modal-body">
            <p className="muted">Your progress at a glance. These are sample results.</p>
            <div className="stat-grid">
              <div className="stat-card">
                <strong>14</strong>
                <span>Current streak</span>
              </div>
              <div className="stat-card">
                <strong>87</strong>
                <span>Games played</span>
              </div>
              <div className="stat-card">
                <strong>78%</strong>
                <span>Avg. percentile</span>
              </div>
              <div className="stat-card">
                <strong>4.2</strong>
                <span>Avg. attempts</span>
              </div>
            </div>
            <h3>Recent scores</h3>
            <div className="score-bars">
              <div>
                <span>Mon</span>
                <i style={{ height: '68%' }} />
                <b>68</b>
              </div>
              <div>
                <span>Tue</span>
                <i style={{ height: '82%' }} />
                <b>82</b>
              </div>
              <div>
                <span>Wed</span>
                <i style={{ height: '74%' }} />
                <b>74</b>
              </div>
              <div>
                <span>Thu</span>
                <i style={{ height: '91%' }} />
                <b>91</b>
              </div>
              <div>
                <span>Fri</span>
                <i style={{ height: '79%' }} />
                <b>79</b>
              </div>
              <div>
                <span>Sat</span>
                <i style={{ height: '88%' }} />
                <b>88</b>
              </div>
              <div>
                <span>Sun</span>
                <i style={{ height: '94%' }} />
                <b>94</b>
              </div>
            </div>
          </div>
        )}
        {panel === 'leaderboard' && (
          <div className="modal-body">
            <p className="muted">Today&apos;s best solutions · sample rankings</p>
            <div className="leaderboard-head">
              <span>RANK / PLAYER</span>
              <span>FORCE</span>
              <span>TILES</span>
              <span>TIME</span>
            </div>
            <div className="leaderboard-list">
              {rankings.map((entry, index) => (
                <div
                  className={`leaderboard-row ${entry.name === 'You' ? 'your-row' : ''}`}
                  key={index}
                >
                  <span>
                    <b>{entry.rank}</b> {entry.name}
                  </span>
                  <span>{entry.force}</span>
                  <span>{entry.tiles}</span>
                  <span>{entry.time}</span>
                </div>
              ))}
            </div>
            <p className="modal-footnote">Solutions unlock after you solve the daily puzzle.</p>
          </div>
        )}
        {panel === 'settings' && (
          <div className="modal-body">
            <p className="muted">Make the preview feel right for you.</p>
            <div className="setting-row">
              <div>
                <strong>Sound effects</strong>
                <span>Play sounds during a run</span>
              </div>
              <button
                className={`switch ${sound ? 'on' : ''}`}
                role="switch"
                aria-checked={sound}
                aria-label="Sound effects"
                onClick={() => setSound(!sound)}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Reduced motion</strong>
                <span>Use simpler animations</span>
              </div>
              <button
                className={`switch ${reducedMotion ? 'on' : ''}`}
                role="switch"
                aria-checked={reducedMotion}
                aria-label="Reduced motion"
                onClick={() => setReducedMotion(!reducedMotion)}
              >
                <span />
              </button>
            </div>
            <p className="modal-footnote">Settings are for this mockup and are not saved yet.</p>
          </div>
        )}
        {panel === 'help' && (
          <div className="modal-body">
            <p className="muted">Get the ball into the cup using the fewest forces you can.</p>
            <div className="steps">
              <div>
                <b>01</b>
                <span>
                  <strong>Study the course</strong>
                  <small>Look for terrain, walls, and the goal.</small>
                </span>
              </div>
              <div>
                <b>02</b>
                <span>
                  <strong>Place force tiles</strong>
                  <small>Pick tiles from your toolkit, then drag their fields on the course.</small>
                </span>
              </div>
              <div>
                <b>03</b>
                <span>
                  <strong>Press Play</strong>
                  <small>Watch the ball move, then improve your plan.</small>
                </span>
              </div>
            </div>
            <p className="modal-footnote">
              A field pushes only the part of the ball it overlaps. Hold the ball in the goal to
              finish.
            </p>
          </div>
        )}
        {panel === 'result' && result && (
          <div className="modal-body result-body">
            <div className="result-trophy">{result.solved ? '🏆' : '⛳'}</div>
            <p>
              {result.solved
                ? 'The ball held in the goal.'
                : 'The ball stopped short of the goal. Adjust your fields and try again.'}
            </p>
            <div className="result-grid">
              <div>
                <strong>{result.tiles * TILE_COST}</strong>
                <span>Force cost</span>
              </div>
              <div>
                <strong>{result.tiles}</strong>
                <span>Tiles</span>
              </div>
              <div>
                <strong>{result.seconds.toFixed(2)}s</strong>
                <span>{result.solved ? 'Ball time' : 'Run time'}</span>
              </div>
            </div>
            <button className="primary-button" onClick={close}>
              Back to course <Icon name="arrow" size={18} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Home() {
  const [panel, setPanel] = useState<Panel>(null);
  const [level, setLevel] = useState<Level>(LEVELS[0]!.level);
  const [importBounds, setImportBounds] = useState<Bounds | null>(null);
  function loadCourse(next: Level, bounds?: Bounds) {
    setLevel(next);
    setImportBounds(bounds ?? null);
  }
  const [reducedMotion, setReducedMotion] = useState(false);
  const puzzle = usePuzzle(level);
  const nav: { name: Exclude<Panel, 'result' | null> | 'daily'; label: string; icon: IconName }[] =
    [
      { name: 'daily', label: 'Daily', icon: 'calendar' },
      { name: 'archive', label: 'Archive', icon: 'calendar' },
      { name: 'stats', label: 'Stats', icon: 'stats' },
      { name: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
      { name: 'settings', label: 'Settings', icon: 'settings' },
    ];

  useEffect(() => {
    if (puzzle.result !== null) setPanel('result');
  }, [puzzle.result]);

  return (
    <div className={`site-wrap ${reducedMotion ? 'reduce-motion' : ''}`}>
      <header className="site-header">
        <button className="brand" onClick={() => setPanel(null)} aria-label="Puttential home">
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
              className={`nav-button ${panel === item.name || (item.name === 'daily' && panel === null) ? 'active' : ''}`}
              onClick={() => {
                if (item.name === 'daily') loadCourse(LEVELS[0]!.level);
                setPanel(item.name === 'daily' ? null : item.name);
              }}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="streak-pill" onClick={() => setPanel('stats')}>
          <Icon name="fire" size={17} /> <strong>14</strong>
          <span>day streak</span>
        </button>
      </header>

      <main className="dashboard">
        <LevelImport onLoad={loadCourse} />
        <div className="page-heading">
          <div>
            <span className="eyebrow">TUESDAY • SEPTEMBER 22, 2026</span>
            <h1>
              Daily challenge <span>#126</span>
            </h1>
            <p>One course. Your own way to the cup.</p>
          </div>
          <button className="how-button" onClick={() => setPanel('help')}>
            <Icon name="help" size={18} /> How to play
          </button>
        </div>

        <div className="game-layout">
          <section className="game-card" aria-labelledby="course-title">
            <div className="card-heading">
              <div>
                <span className="section-kicker">
                  {level === LEVELS[0]!.level ? "TODAY'S COURSE" : 'ARCHIVE COURSE'}
                </span>
                <h2 id="course-title">{levelName(level)}</h2>
              </div>
              <span className="difficulty">
                <span /> MODERATE
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
                frameRef={puzzle.frameRef}
                goalRef={puzzle.goalRef}
                draft={puzzle.draft}
                mode={puzzle.mode}
                trail={puzzle.trail}
                onMoveField={puzzle.moveField}
              />
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
              <span className="demo-note">
                {puzzle.mode === 'setup'
                  ? Object.values(puzzle.draft).some((field) => field.enabled)
                    ? 'Drag fields to move them'
                    : 'Pick a tile to add its field'
                  : puzzle.mode === 'running'
                    ? 'Simulation running'
                    : puzzle.mode === 'loading'
                      ? 'Loading course…'
                      : 'Run finished'}
              </span>
            </div>
          </section>

          <aside className="control-column">
            <section className="control-card">
              <div className="control-heading">
                <span className="section-kicker">YOUR TOOLKIT</span>
                <h2>Force tiles</h2>
                <p>Pick a tile to add its field to the course. Each tile costs 1 point.</p>
              </div>
              <ForceToolkit level={level} puzzle={puzzle} />
              <div className="attempt-line">
                <span>Attempts today</span>
                <strong>{puzzle.attempts}</strong>
              </div>
              <PlayButton puzzle={puzzle} />
              <button
                className="text-button"
                disabled={puzzle.mode === 'loading'}
                onClick={puzzle.resetLayout}
              >
                <Icon name="reset" size={16} /> Reset layout
              </button>
            </section>
            <div className="tip-card">
              <span className="tip-icon">✦</span>
              <div>
                <strong>Today&apos;s tip</strong>
                <p>
                  The dotted line previews the first second of your run. After that, you&apos;re on
                  your own.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section className="bottom-strip" aria-label="Daily progress">
          <div>
            <span className="strip-icon green">
              <Icon name="calendar" />
            </span>
            <span>
              <strong>One puzzle each day</strong>
              <small>Come back tomorrow for a new course.</small>
            </span>
          </div>
          <div>
            <span className="strip-icon yellow">
              <Icon name="trophy" />
            </span>
            <span>
              <strong>Find your best solution</strong>
              <small>Use less force to climb the leaderboard.</small>
            </span>
          </div>
          <div>
            <span className="strip-icon coral">
              <Icon name="fire" />
            </span>
            <span>
              <strong>Keep the streak alive</strong>
              <small>You&apos;re on a 14 day run.</small>
            </span>
          </div>
        </section>
      </main>
      {panel && (
        <Modal
          panel={panel}
          close={() => setPanel(null)}
          reducedMotion={reducedMotion}
          setReducedMotion={setReducedMotion}
          result={puzzle.result}
          currentLevel={level}
          chooseLevel={loadCourse}
        />
      )}
    </div>
  );
}
