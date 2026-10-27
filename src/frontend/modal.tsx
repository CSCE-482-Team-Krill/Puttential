'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Level } from '../game';
import { Icon } from './icon';
import type { RunResult } from './puzzle';

export type Panel = 'archive' | 'stats' | 'leaderboard' | 'settings' | 'help' | 'result' | null;

type Preferences = {
  muteMusic: boolean;
  muteEffects: boolean;
  reducedMotion: boolean;
  showPreview: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  muteMusic: false,
  muteEffects: false,
  reducedMotion: false,
  showPreview: true,
};
const PREFERENCES_KEY = 'puttential-preferences';

export function usePreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
      if (stored && typeof stored === 'object') {
        const values = stored as Record<string, unknown>;
        setPreferences({
          muteMusic: typeof values.muteMusic === 'boolean' ? values.muteMusic : false,
          muteEffects: typeof values.muteEffects === 'boolean' ? values.muteEffects : false,
          reducedMotion: typeof values.reducedMotion === 'boolean' ? values.reducedMotion : false,
          showPreview: typeof values.showPreview === 'boolean' ? values.showPreview : true,
        });
      }
    } catch {
      // A disabled store or invalid saved value should not prevent playing.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences still work for this visit when storage is unavailable.
    }
  }, [loaded, preferences]);

  return [preferences, setPreferences] as const;
}

const HELP_SECTIONS = [
  {
    title: 'Objective',
    content:
      'Guide the ball (or course object) into the goal and keep it there until the goal fills. Aim for the lowest force cost you can.',
  },
  {
    title: 'How to play',
    content:
      'Choose a force block from your toolkit, then drag its field into position on the course. The dotted path previews the start of the run. Press Play to lock your layout and watch it move. Use Try again to adjust your plan, or Reset layout to start over.',
  },
  {
    title: 'Scoring',
    content:
      'Each placed block costs 1 point. Successful solutions rank by force cost, then tile count, attempts to your first solve, simulated completion time, and path length. Fewer points is better.',
  },
  {
    title: 'Daily Challenges',
    content:
      'Everyone gets the same daily course, starting object, goal, tile inventory, and physics settings. Open Calendar to choose the daily course or try a practice course.',
  },
] as const;

// Profile and leaderboard data remain samples until accounts are connected.
const RANKINGS = [
  { rank: 1, name: 'birdbrain', force: 2, tiles: 1, time: '4.82s' },
  { rank: 2, name: 'physwiz', force: 3, tiles: 2, time: '3.14s' },
  { rank: 3, name: 'krillking', force: 3, tiles: 2, time: '5.26s' },
  { rank: 4, name: 'greenkeeper', force: 4, tiles: 2, time: '4.67s' },
  { rank: 5, name: 'parfect', force: 4, tiles: 3, time: '5.92s' },
  { rank: 6, name: 'You', force: 5, tiles: 3, time: '6.31s' },
] as const;

type Props = {
  panel: Exclude<Panel, null>;
  close: () => void;
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
  result: RunResult | null;
  levels: readonly { level: Level; day: string }[];
  currentLevel: Level;
  chooseLevel: (level: Level) => void;
  tileCost: number;
};

function SettingSwitch({
  label,
  checked,
  change,
}: {
  label: string;
  checked: boolean;
  change: () => void;
}) {
  return (
    <div className="modal-row setting-row">
      <span>{label}</span>
      <button
        className={`switch ${checked ? 'on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={change}
      >
        <span />
      </button>
    </div>
  );
}

export function Modal({
  panel,
  close,
  preferences,
  setPreferences,
  result,
  levels,
  currentLevel,
  chooseLevel,
  tileCost,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const titles: Record<Exclude<Panel, null>, string> = {
    archive: 'Calendar',
    stats: 'You',
    leaderboard: 'Leaderboard',
    settings: 'Settings',
    help: 'Help',
    result: result?.solved === false ? 'So close' : 'Nice work!',
  };

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), summary, a[href], input:not(:disabled), [tabindex="0"]',
        ) ?? [],
      );
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function togglePreference(key: keyof Preferences) {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className={`modal modal-${panel}`}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{panel === 'stats' ? 'YOUR PROFILE' : 'PUTTENTIAL'}</span>
            <h2 id="modal-title">{titles[panel]}</h2>
          </div>
          <button className="icon-button close-button" onClick={close} aria-label="Close panel">
            <Icon name="close" />
          </button>
        </div>

        {panel === 'help' && (
          <div className="modal-body modal-stack">
            {HELP_SECTIONS.map(({ title, content }) => (
              <details className="help-section" key={title}>
                <summary>
                  {title}
                  <span className="help-expand" aria-hidden="true" />
                </summary>
                <p>{content}</p>
              </details>
            ))}
          </div>
        )}

        {panel === 'stats' && (
          <div className="modal-body modal-stack">
            <section className="profile-section" aria-labelledby="profile-stats">
              <h3 id="profile-stats" className="modal-section-heading">
                Stats
              </h3>
              <dl className="profile-metrics">
                <div>
                  <dt>Current streak</dt>
                  <dd>
                    14 <small>days</small>
                  </dd>
                </div>
                <div>
                  <dt>Average attempts</dt>
                  <dd>4.2</dd>
                </div>
              </dl>
            </section>
            <section className="profile-section" aria-labelledby="profile-games">
              <h3 id="profile-games" className="modal-section-heading">
                Games played
              </h3>
              <div className="profile-summary">
                <strong>87</strong>
                <span>courses played</span>
              </div>
            </section>
            <section className="profile-section" aria-labelledby="profile-ranking">
              <h3 id="profile-ranking" className="modal-section-heading">
                Ranking
              </h3>
              <dl className="profile-metrics">
                <div>
                  <dt>Today&apos;s position</dt>
                  <dd>#6</dd>
                </div>
                <div>
                  <dt>Average percentile</dt>
                  <dd>
                    78<small>%</small>
                  </dd>
                </div>
              </dl>
            </section>
            <p className="modal-footnote">Sample profile · progress tracking is coming soon.</p>
          </div>
        )}

        {panel === 'leaderboard' && (
          <div className="modal-body modal-stack">
            <p className="modal-intro">
              Today&apos;s solutions <span>Lowest force cost wins</span>
            </p>
            <ol className="modal-stack ranking-list" aria-label="Sample rankings">
              {RANKINGS.map((entry) => (
                <li
                  className={`modal-row ranking-row ${entry.name === 'You' ? 'your-row' : ''}`}
                  key={entry.rank}
                >
                  <span className="ranking-number">#{entry.rank}</span>
                  <span className="ranking-player">
                    <strong>{entry.name}</strong>
                    <small>
                      {entry.tiles} {entry.tiles === 1 ? 'tile' : 'tiles'} · {entry.time}
                    </small>
                  </span>
                  <span className="ranking-score">
                    {entry.force}
                    <small>pt</small>
                  </span>
                  <span className="player-avatar" aria-hidden="true">
                    {entry.name.slice(0, 1).toUpperCase()}
                  </span>
                </li>
              ))}
            </ol>
            <p className="modal-footnote">
              Sample rankings. Ties use tile count, first-solve attempts, simulation time, then path
              length.
            </p>
          </div>
        )}

        {panel === 'archive' && (
          <div className="modal-body modal-stack">
            <p className="modal-intro">
              Available courses <span>Find another way to the goal</span>
            </p>
            <div className="modal-stack archive-list">
              {levels.map(({ level, day }, index) => (
                <button
                  className={`modal-row archive-row ${level === currentLevel ? 'current-course' : ''}`}
                  key={level.id}
                  onClick={() => {
                    chooseLevel(level);
                    close();
                  }}
                  aria-current={level === currentLevel ? 'true' : undefined}
                >
                  <span className="archive-number">#{index + 1}</span>
                  <span className="archive-course">
                    <strong>
                      {level.id
                        .split('-')
                        .map((word) => word[0]!.toUpperCase() + word.slice(1))
                        .join(' ')}
                    </strong>
                    <small>{day}</small>
                  </span>
                  <span className="row-status">
                    {level === currentLevel ? 'Playing' : 'Play'}
                    <Icon name="arrow" size={15} />
                  </span>
                </button>
              ))}
            </div>
            <p className="modal-footnote">Choose a course to start a fresh layout.</p>
          </div>
        )}

        {panel === 'settings' && (
          <div className="modal-body modal-stack">
            <section className="settings-section" aria-labelledby="audio-settings">
              <h3 className="modal-section-heading" id="audio-settings">
                Audio
              </h3>
              <SettingSwitch
                label="Mute music"
                checked={preferences.muteMusic}
                change={() => togglePreference('muteMusic')}
              />
              <SettingSwitch
                label="Mute sound effects"
                checked={preferences.muteEffects}
                change={() => togglePreference('muteEffects')}
              />
            </section>
            <section className="settings-section" aria-labelledby="display-settings">
              <h3 className="modal-section-heading" id="display-settings">
                Display
              </h3>
              <SettingSwitch
                label="Reduced motion"
                checked={preferences.reducedMotion}
                change={() => togglePreference('reducedMotion')}
              />
              <SettingSwitch
                label="Show path preview"
                checked={preferences.showPreview}
                change={() => togglePreference('showPreview')}
              />
            </section>
            <p className="modal-footnote">
              Preferences are saved on this device. Audio playback is not available yet.
            </p>
          </div>
        )}

        {panel === 'result' && result && (
          <div className="modal-body result-body">
            <div className="result-trophy" aria-hidden="true">
              <Icon name={result.solved ? 'trophy' : 'help'} size={48} />
            </div>
            <p>
              {result.solved
                ? 'The ball held in the goal.'
                : result.failure === 'water'
                  ? 'The ball sank in water. Keep it moving or find a route around.'
                  : result.failure === 'lava'
                    ? 'The ball burnt in lava. Find a route around it.'
                    : result.failure === 'out-of-bounds'
                      ? 'An object left the course. Keep at least part of every object inside the board.'
                      : 'The ball stopped short of the goal. Adjust your fields and try again.'}
            </p>
            <div className="result-grid">
              <div>
                <strong>{result.tiles * tileCost}</strong>
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
