'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, ReactNode, RefObject } from 'react';
import type { Level } from '../game';
import { Icon } from './icon';
import type { RunResult } from './puzzle';
import { TILE_COST } from './score-display';

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
      'Turn a block ON in your toolkit, then drag its field on the course or edit the selected tile’s X/Y controls. Three dots and an arrow show the initial direction. Rotation is available only with a compatible engine; unavailable controls say so. Press Play to lock your layout and watch it move. Stop ends that run; Try again returns to setup.',
  },
  {
    title: 'Scoring',
    content:
      'Published courses set each tile’s cost, shown in the toolkit. Practice costs 1 per tile and is unranked. Verified solutions rank by force cost, tile count, first verified solve run number, completion tick, then path length. Tied tuples share rank. First verified solve is the ordinal of the first success saved and verified, separate from total accepted starts. Stop and interrupted ranked starts count; editing and practice do not.',
  },
  {
    title: 'Daily Challenges',
    content:
      'Everyone gets the same dated course and limited inventory. Runs use simulated time with a maximum of 60 seconds (a course may set a smaller cap). The original daily window closes at Central midnight; standings stay provisional while eligible results await verification. Archive rankings stay open. Open Calendar for published historical courses or separate practice courses. Offline practice never becomes a ranked attempt later.',
  },
  {
    title: 'Saving and recovery',
    content:
      'Ranked Play requires a confirmed guest session, compatible rules and a server-accepted start. Local results stay unverified until acknowledged. Pending saves can be retried. Keep this page open when refresh recovery is unavailable. Guest access belongs to this browser’s cookie; clearing it loses access. Another tab can play a distinct run without interrupting yours.',
  },
] as const;

// Display-only fixtures, rendered exclusively by the development preview.
const RANKINGS = [
  { rank: 1, name: 'Example player 1', tiles: 1, time: '4.82s' },
  { rank: 2, name: 'Example player 2', tiles: 2, time: '3.14s' },
  { rank: 3, name: 'Example player 3', tiles: 2, time: '5.26s' },
  { rank: 4, name: 'Example player 4', tiles: 3, time: '4.67s' },
  { rank: 5, name: 'Example player 5', tiles: 3, time: '5.92s' },
  { rank: 6, name: 'Example player 6', tiles: 4, time: '6.31s' },
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
  previewMode?: boolean;
  courseImport?: ReactNode;
  body?: ReactNode;
  /** Replays the first-visit walkthrough from Help. */
  showTutorial?: () => void;
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

/** Focus, Escape and Tab containment shared by every modal dialog. */
export function useDialog(dialogRef: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
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
          'button:not(:disabled), summary, a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
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
  }, [dialogRef]);
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
  previewMode = false,
  courseImport,
  body,
  showTutorial,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialog(dialogRef, close);
  const titles: Record<Exclude<Panel, null>, string> = {
    archive: 'Calendar',
    stats: 'Profile',
    leaderboard: 'Leaderboard',
    settings: 'Settings',
    help: 'Help',
    result: result?.solved === false ? 'So close' : 'Nice work!',
  };

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
            {showTutorial && (
              <button className="tutorial-launch" onClick={showTutorial}>
                <span className="tutorial-launch-icon" aria-hidden="true">
                  <Icon name="play" size={20} />
                </span>
                <span>
                  <strong>Watch the tutorial</strong>
                  <small>Watch a full shot step by step, then try it yourself.</small>
                </span>
              </button>
            )}
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

        {body && <div className="modal-body modal-stack">{body}</div>}
        {!body && panel === 'stats' && (
          <div className="modal-body modal-stack">
            <p className="modal-intro">Profile statistics are not connected.</p>
            {[
              ['stats', 'Stats'],
              ['games', 'Games played'],
              ['ranking', 'Ranking'],
            ].map(([id, title]) => (
              <section className="profile-section" aria-labelledby={`profile-${id}`} key={id}>
                <h3 id={`profile-${id}`} className="modal-section-heading">
                  {title}
                </h3>
                <p className="unavailable-state">No recorded data available</p>
              </section>
            ))}
          </div>
        )}

        {!body && panel === 'leaderboard' && (
          <div className="modal-body modal-stack">
            {previewMode ? (
              <>
                <p className="modal-intro">EXAMPLE RANKINGS — PREVIEW ONLY</p>
                <ol className="modal-stack ranking-list" aria-label="Sample rankings">
                  {RANKINGS.map((entry) => (
                    <li className="modal-row ranking-row" key={entry.rank}>
                      <span className="ranking-number">#{entry.rank}</span>
                      <span className="ranking-player">
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.tiles} {entry.tiles === 1 ? 'tile' : 'tiles'} · {entry.time}
                        </small>
                      </span>
                      <span className="ranking-score">
                        {entry.tiles * tileCost}
                        <small>pt</small>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="modal-footnote">
                  Example rankings. Ties use tile count, first-solve attempts, simulation time, then
                  path length.
                </p>
              </>
            ) : (
              <p className="unavailable-state">Leaderboard is not available yet.</p>
            )}
          </div>
        )}

        {!body && panel === 'archive' && (
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
            {courseImport && (
              <section className="settings-section" aria-labelledby="local-course-settings">
                <h3 className="modal-section-heading" id="local-course-settings">
                  Local courses
                </h3>
                {courseImport}
              </section>
            )}
            <p className="modal-footnote">
              Preferences are saved on this device. Audio playback is not available yet.
            </p>
          </div>
        )}

        {!body && panel === 'result' && result && (
          <div className="modal-body result-body">
            <div className="result-mark brand-mark" aria-hidden="true">
              <span className="brand-ball" />
              <span className="brand-flag" />
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
            {!result.solved && (
              <p className="result-helper">
                Close this panel, then choose Try again to adjust your fields.
              </p>
            )}
            <div className="result-grid">
              <div>
                <strong>{result.forceCost ?? result.tiles * tileCost}</strong>
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
