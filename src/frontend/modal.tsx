'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, ReactNode, RefObject } from 'react';
import { Icon } from './icon';

export type Panel = 'archive' | 'stats' | 'leaderboard' | 'settings' | 'help' | 'result' | null;

type Preferences = {
  reducedMotion: boolean;
  showPreview: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
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

type Props = {
  panel: Exclude<Panel, null>;
  close: () => void;
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
  resultSolved?: boolean;
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
  resultSolved = true,
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
    result: resultSolved ? 'Nice work!' : 'So close',
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
        {panel === 'settings' && (
          <div className="modal-body modal-stack">
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
