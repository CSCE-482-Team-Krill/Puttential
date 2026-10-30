'use client';

import { useEffect, useRef, useState } from 'react';
import type { RenderState } from '../../game/types';
import { FIXED_DT } from '../../game/simulation';
import { initialGoal } from '../goal-progress';
import type { Player, PuzzleResponse, ReplayResponse, Scope } from '../../shared/puzzle-contracts';
import { ApiError, puzzleApi } from '../api';
import { deliveredEngine } from '../engine-adapter';
import type { AuthoritativeState } from '../authoritative-state';
import { CourseCanvas } from '../course-canvas';
import { ReplayPlayback } from '../replay-playback';
import type { ReplaySpeed } from '../replay-playback';

function ReplayPlayer({ puzzle, replay }: { puzzle: PuzzleResponse; replay: ReplayResponse }) {
  const playback = useRef<ReplayPlayback | null>(null);
  const frameRef = useRef<RenderState | null>(null);
  const goalRef = useRef(initialGoal(puzzle.configuration.goal));
  const [error, setError] = useState('');
  const [, update] = useState(0);
  useEffect(() => {
    let canceled = false;
    let frame = 0;
    let previous = performance.now();
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
  if (error) return <p role="alert">{error}</p>;
  return (
    <div className="modal-stack">
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
      </div>
      {!current ? (
        <p role="status">Preparing replay…</p>
      ) : (
        <>
          <div className="panel-actions replay-controls">
            <button
              disabled={current.status === 'ended' || current.status === 'error'}
              onClick={() => {
                if (current.status === 'playing') current.pause();
                else current.play();
                update((n) => n + 1);
              }}
            >
              {current.status === 'playing' ? 'Pause replay' : 'Play replay'}
            </button>
            <button
              onClick={() => {
                current.restart();
                frameRef.current = current.frame;
                goalRef.current = current.goal;
                update((n) => n + 1);
              }}
            >
              Restart replay
            </button>
            <label>
              Speed
              <select
                aria-label="Replay speed"
                value={current.speed}
                onChange={(e) => {
                  current.speed = Number(e.target.value) as ReplaySpeed;
                  update((n) => n + 1);
                }}
              >
                <option value="0.5">0.5×</option>
                <option value="1">1×</option>
                <option value="2">2×</option>
              </select>
            </label>
          </div>
          <p className="replay-time" aria-label="Replay elapsed time">
            {(current.frame.tick * FIXED_DT).toFixed(2)}s /{' '}
            {((replay.result.metrics?.completionTick ?? 0) * FIXED_DT).toFixed(2)}s
          </p>
          {current.error ? (
            <p role="alert">{current.error}</p>
          ) : (
            <p role="status">
              {current.status === 'ended'
                ? 'Replay complete — verified solution.'
                : current.status === 'playing'
                  ? 'Playing replay.'
                  : 'Replay paused.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function ReplayPanel({
  puzzle,
  target,
  scope,
  viewerId,
  state,
  back,
  reconcileGuest,
  refresh,
}: {
  puzzle: PuzzleResponse;
  target: Player;
  scope: Scope;
  viewerId: string;
  state: AuthoritativeState;
  back: () => void;
  reconcileGuest: () => void;
  refresh: () => void;
}) {
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
  return (
    <div className="modal-stack replay-viewer">
      <button className="replay-back" onClick={back}>
        Back to standings
      </button>
      <h3 ref={heading} tabIndex={-1}>
        {replay?.player.nickname ?? target.nickname}’s solution
      </h3>
      <p className="modal-footnote">
        {puzzle.date} · {scope === 'daily' ? 'Daily best' : 'Archive best'} · Read-only replay
      </p>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry replay</button>
        </>
      ) : !replay ? (
        <p role="status">Loading replay…</p>
      ) : (
        <>
          <p>
            {metrics?.forceCost} pt · {metrics?.tileCount} tiles ·{' '}
            {((metrics?.completionTick ?? 0) * FIXED_DT).toFixed(2)}s · Saved and verified
          </p>
          <ReplayPlayer puzzle={puzzle} replay={replay} />
        </>
      )}
    </div>
  );
}
