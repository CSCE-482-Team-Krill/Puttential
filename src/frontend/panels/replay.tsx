'use client';

import { useEffect, useRef, useState } from 'react';
import type { RenderState } from '../../game/types';
import { FIXED_DT } from '../../game/simulation';
import { levelBounds } from '../../game/levels/codec';
import { initialGoal } from '../goal-progress';
import type {
  LeaderboardRow,
  PuzzleResponse,
  ReplayResponse,
  Scope,
} from '../../shared/puzzle-contracts';
import { ApiError, puzzleApi } from '../api';
import { deliveredEngine } from '../engine-adapter';
import type { AuthoritativeState } from '../authoritative-state';
import { CourseCanvas } from '../course-canvas';
import { Icon } from '../icon';
import { physicsAudio } from '../physics-audio';
import { ReplayPlayback } from '../replay-playback';
import type { ReplaySpeed } from '../replay-playback';

function ReplayPlayer({ puzzle, replay }: { puzzle: PuzzleResponse; replay: ReplayResponse }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const playback = useRef<ReplayPlayback | null>(null);
  const frameRef = useRef<RenderState | null>(null);
  const goalRef = useRef(initialGoal(puzzle.configuration.goal));
  const [error, setError] = useState('');
  const [, update] = useState(0);
  useEffect(() => {
    setFullscreenAvailable(document.fullscreenEnabled);
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setFullscreen(active);
      if (!active) fullscreenButtonRef.current?.focus();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === containerRef.current) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      setFullscreenError('Fullscreen is unavailable. Please try again.');
    }
  }

  useEffect(() => {
    let canceled = false;
    let frame = 0;
    let previous = performance.now();
    const bounds = levelBounds(puzzle.configuration);
    physicsAudio.prepare();
    void ReplayPlayback.create(puzzle.configuration, puzzle.rules, replay.placement, replay.result)
      .then((created) => {
        if (canceled) {
          created.destroy();
          return;
        }
        playback.current = created;
        frameRef.current = created.frame;
        goalRef.current = created.goal;
        update((n) => n + 1);
        frame = requestAnimationFrame(function animate(now) {
          const before = created.frame.tick;
          const status = created.status;
          created.advance((now - previous) / 1000);
          physicsAudio.play(created.takeSoundEvents(), { bounds });
          previous = now;
          frameRef.current = created.frame;
          goalRef.current = created.goal;
          if (before !== created.frame.tick || status !== created.status) update((n) => n + 1);
          frame = requestAnimationFrame(animate);
        });
      })
      .catch((cause: unknown) => {
        if (!canceled) setError(cause instanceof Error ? cause.message : 'Replay unavailable.');
      });
    const visibility = () => {
      if (document.hidden) {
        playback.current?.pause();
        update((n) => n + 1);
      }
      previous = performance.now();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      canceled = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      playback.current?.destroy();
      playback.current = null;
      physicsAudio.stopAll();
      frameRef.current = null;
    };
    // Published course versions are immutable; focus refreshes must not reset a paused replay.
  }, [
    puzzle.id,
    puzzle.configuration.version,
    puzzle.rules.rulesVersion,
    puzzle.rules.simulationVersion,
    replay,
  ]);

  const current = playback.current;
  const completionTick = replay.result.metrics?.completionTick ?? 0;
  if (error) return <p role="alert">{error}</p>;
  return (
    <div className="modal-stack replay-player" ref={containerRef}>
      <div className="replay-playback-layout">
        <div className="course replay-course">
          <CourseCanvas
            level={puzzle.configuration}
            frameRef={frameRef}
            goalRef={goalRef}
            draft={{}}
            mode="running"
            trail={[]}
            editingLocked
            onMoveField={() => {}}
            ariaLabel={`Read-only replay of ${replay.player.nickname}’s solution`}
          />
          <button
            className="replay-fullscreen"
            ref={fullscreenButtonRef}
            disabled={!fullscreenAvailable}
            title={fullscreenAvailable ? undefined : 'Fullscreen is unavailable in this browser.'}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen replay'}
            aria-pressed={fullscreen}
            onClick={() => void toggleFullscreen()}
          >
            <Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} size={20} />
          </button>
        </div>
        {current && (
          <div className="replay-controls">
            <div className="replay-control-buttons">
              <button
                className="replay-control-button"
                aria-label={current.status === 'playing' ? 'Pause replay' : 'Play replay'}
                disabled={current.status === 'ended' || current.status === 'error'}
                onClick={() => {
                  if (current.status === 'playing') current.pause();
                  else current.play();
                  update((n) => n + 1);
                }}
              >
                <Icon name={current.status === 'playing' ? 'pause' : 'play'} size={20} />
              </button>
              <button
                className="replay-control-button"
                aria-label="Restart replay"
                onClick={() => {
                  current.restart();
                  physicsAudio.stopAll();
                  frameRef.current = current.frame;
                  goalRef.current = current.goal;
                  update((n) => n + 1);
                }}
              >
                <Icon name="reset" size={20} />
              </button>
            </div>
            <fieldset className="replay-speed" aria-label="Replay speed">
              <legend>Speed</legend>
              <div>
                {([0.5, 1, 2, 4] as const).map((speed) => (
                  <label key={speed}>
                    <input
                      type="radio"
                      name="replay-speed"
                      value={speed}
                      checked={current.speed === speed}
                      onChange={() => {
                        current.speed = speed as ReplaySpeed;
                        update((n) => n + 1);
                      }}
                    />
                    <span>{speed}×</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </div>
      {!current ? (
        <p role="status">Preparing replay…</p>
      ) : (
        <>
          <div className="replay-timeline">
            <progress
              aria-label="Replay progress"
              max={Math.max(1, completionTick)}
              value={Math.min(current.frame.tick, completionTick)}
            />
            <span className="replay-time" aria-label="Replay elapsed time">
              {(current.frame.tick * FIXED_DT).toFixed(2)}s /{' '}
              {(completionTick * FIXED_DT).toFixed(2)}s
            </span>
          </div>
          {fullscreenError && <p role="alert">{fullscreenError}</p>}
          {current.error && <p role="alert">{current.error}</p>}
        </>
      )}
    </div>
  );
}

export function ReplayPanel({
  puzzle,
  row,
  scope,
  viewerId,
  state,
  reconcileGuest,
  refresh,
}: {
  puzzle: PuzzleResponse;
  row: LeaderboardRow;
  scope: Scope;
  viewerId: string;
  state: AuthoritativeState;
  reconcileGuest: () => void;
  refresh: () => void;
}) {
  const target = row.player;
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const callbacks = useRef({ reconcileGuest, refresh });
  callbacks.current = { reconcileGuest, refresh };
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setReplay(null);
    setError('');
    void puzzleApi
      .replay(puzzle.id, target.id, scope, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.viewerGuestId !== viewerId) {
          callbacks.current.reconcileGuest();
          throw new Error('Guest session changed. Reopen the leaderboard.');
        }
        if (
          response.puzzleId !== puzzle.id ||
          response.player.id !== target.id ||
          response.scope !== scope
        )
          throw new Error('Replay response does not match this selection.');
        state.applyAvailability(response.availability);
        if (state.availability.get(puzzle.id)?.publicationStatus === 'canceled')
          throw new Error('This course was canceled.');
        if (!deliveredEngine.supports(puzzle.rules))
          throw new Error(
            'This replay requires an engine version that is unavailable in this app.',
          );
        setReplay(response);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) callbacks.current.reconcileGuest();
        if (cause instanceof ApiError && (cause.status === 410 || cause.code === 'REPLAY_LOCKED'))
          callbacks.current.refresh();
        setError(cause instanceof Error ? cause.message : 'Replay unavailable.');
      });
    return () => controller.abort();
  }, [
    puzzle.id,
    puzzle.configuration.version,
    puzzle.rules.rulesVersion,
    puzzle.rules.simulationVersion,
    target.id,
    scope,
    viewerId,
    state,
    retry,
  ]);
  const metrics = replay?.result.metrics;
  const replayDate = puzzle.date
    ? new Date(`${puzzle.date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : puzzle.title;
  return (
    <div className="modal-stack replay-viewer">
      <h3 className="sr-only" ref={heading} tabIndex={-1}>
        {replay?.player.nickname ?? target.nickname}’s solution
      </h3>
      {puzzle.date ? (
        <time className="replay-date" dateTime={puzzle.date}>
          {replayDate}
        </time>
      ) : (
        <p className="replay-date">{replayDate}</p>
      )}
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry replay</button>
        </>
      ) : !replay ? (
        <p role="status">Loading replay…</p>
      ) : (
        <>
          <div className="replay-summary-wrap">
            <table className="replay-summary">
              <caption>{replay.player.nickname}’s verified leaderboard result</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Name</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Tiles</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Time</th>
                  <th scope="col">Path</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{row.rank}</td>
                  <th scope="row">{replay.player.nickname}</th>
                  <td>{metrics?.forceCost}</td>
                  <td>{metrics?.tileCount}</td>
                  <td>{row.firstSolveAttempts}</td>
                  <td>{((metrics?.completionTick ?? 0) * FIXED_DT).toFixed(2)}s</td>
                  <td>{((metrics?.pathLengthQ ?? 0) / 1024).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ReplayPlayer puzzle={puzzle} replay={replay} />
        </>
      )}
    </div>
  );
}
