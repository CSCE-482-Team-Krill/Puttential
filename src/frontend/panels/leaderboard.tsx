'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { BoardView, Player, PuzzleResponse, Scope } from '../../shared/puzzle-contracts';
import { puzzleApi } from '../api';
import { LeaderboardWindow } from '../leaderboard-state';
import type { AuthoritativeState } from '../authoritative-state';
const ReplayPanel = dynamic(() => import('./replay').then((module) => module.ReplayPanel), {
  loading: () => <p role="status">Loading replay viewer…</p>,
});

function formatPuzzleDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');
  const month = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${month} ${day}${suffix}, ${date.getUTCFullYear()}`;
}

export function LeaderboardPanel({
  puzzle,
  player,
  state,
  reconcileGuest,
  runActive = false,
}: {
  puzzle: PuzzleResponse | undefined;
  player: Player | null;
  state: AuthoritativeState;
  reconcileGuest: () => void;
  runActive?: boolean;
}) {
  const [scope, setScope] = useState<Scope>(
    puzzle?.date === puzzle?.todayDate ? 'daily' : 'archive',
  );
  const [view, setView] = useState<BoardView>('top');
  const [busy, setBusy] = useState(false);
  const [, update] = useState(0);
  const [selection, setSelection] = useState<{
    target: Player;
    viewerId: string;
    puzzleId: string;
    scope: Scope;
  } | null>(null);
  const trigger = useRef<string | null>(null);
  const watchButtons = useRef(new Map<string, HTMLButtonElement>());
  const latestLoad = useRef(() => {});
  const window = useMemo(
    () =>
      puzzle && player
        ? new LeaderboardWindow(puzzleApi, player.id, puzzle.id, scope, view, reconcileGuest)
        : null,
    [puzzle?.id, player?.id, scope, view, reconcileGuest],
  );
  async function load(more = false) {
    if (!window) return;
    setBusy(true);
    await window.load(more);
    if (window.board) {
      try {
        state.applyAvailability(window.board.availability);
      } catch {
        window.message = 'Course status changed. Refresh required.';
        window.board = null;
      }
    }
    setBusy(false);
    update((n) => n + 1);
  }
  latestLoad.current = () => {
    void load();
  };
  useEffect(() => {
    void load();
    return () => window?.cancel();
  }, [window]);
  const board = window?.board;
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) latestLoad.current();
    };
    globalThis.window.addEventListener('focus', refresh);
    const remaining =
      board && !board.replayAccess.available && board.availability.publicationStatus === 'active'
        ? Date.parse(board.replayAccess.unlocksAt) - Date.parse(board.asOf)
        : 0;
    const timer =
      remaining > 0 ? setTimeout(refresh, Math.min(remaining + 100, 2_147_483_647)) : undefined;
    return () => {
      globalThis.window.removeEventListener('focus', refresh);
      clearTimeout(timer);
    };
  }, [board]);
  if (!puzzle) return <p>Choose a published dated course to view its leaderboard.</p>;
  if (!player)
    return (
      <p>
        Leaderboard unavailable until your guest session is confirmed. Practice remains available.
      </p>
    );
  const availability = state.availability.get(puzzle.id) ?? puzzle.availability;
  const canceled = availability.publicationStatus === 'canceled';
  if (
    selection &&
    selection.viewerId === player.id &&
    selection.puzzleId === puzzle.id &&
    selection.scope === scope &&
    !canceled &&
    !runActive
  )
    return (
      <ReplayPanel
        key={`${player.id}/${puzzle.id}/${scope}/${selection.target.id}`}
        puzzle={puzzle}
        target={selection.target}
        scope={scope}
        viewerId={player.id}
        state={state}
        reconcileGuest={reconcileGuest}
        refresh={() => void load()}
        back={() => {
          setSelection(null);
          requestAnimationFrame(() => {
            if (trigger.current) watchButtons.current.get(trigger.current)?.focus();
          });
        }}
      />
    );
  return (
    <div className="modal-stack">
      {puzzle.communityMapId ? (
        <p>Community leaderboard — all-time</p>
      ) : (
        <fieldset className="leaderboard-scope">
          <legend>Board</legend>
          <div>
            {(
              [
                ['daily', 'Original daily'],
                ['archive', 'All-time'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="leaderboard-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="panel-actions">
        {(['top', 'around-me'] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === 'top' ? 'Top' : 'Around me'}
          </button>
        ))}
        <button disabled={busy} onClick={() => void load()}>
          Refresh standings
        </button>
      </div>
      {busy && (
        <span className="leaderboard-loading" role="status">
          Loading standings…
        </span>
      )}
      {window?.message && <p role="alert">{window.message}</p>}
      {canceled ? (
        <p role="status">
          Course canceled. {availability.cancellationMessage} Competitive rankings are unavailable.
        </p>
      ) : (
        board && (
          <>
            <div className="leaderboard-status">
              {(puzzle.communityMapId || scope === 'daily') && (
                <p className="modal-footnote">
                  {puzzle.communityMapId
                    ? 'Open — provisional'
                    : board.final
                      ? 'Final'
                      : board.submissionClosed
                        ? 'Closed — verification pending'
                        : 'Open — provisional'}
                </p>
              )}
              <span className="leaderboard-help">
                <button
                  type="button"
                  aria-label="About leaderboard sharing"
                  aria-describedby="leaderboard-sharing-help"
                >
                  ?
                </button>
                <span id="leaderboard-sharing-help" role="tooltip">
                  {puzzle.communityMapId
                    ? 'Verified community solutions are shared automatically. Rankings remain open.'
                    : 'Leaderboard solutions are shared automatically after daily close. Archive rankings remain open.'}
                </span>
              </span>
            </div>
            {!puzzle.communityMapId && !board.replayAccess.available && (
              <p className="modal-footnote">
                Replays unlock after daily close at Central midnight:{' '}
                <time dateTime={board.replayAccess.unlocksAt}>
                  {new Date(board.replayAccess.unlocksAt).toLocaleString('en-US', {
                    timeZone: 'America/Chicago',
                    timeZoneName: 'short',
                  })}
                </time>
                .
              </p>
            )}
            {runActive && <p role="status">Finish or stop your current run to watch a replay.</p>}
            <div className="leaderboard-snapshot">
              <p>{board.totalPlayers} ranked players</p>
              {puzzle.date && (
                <p className="leaderboard-updated">
                  <span>Puzzle date</span>
                  <time dateTime={puzzle.date}>{formatPuzzleDate(puzzle.date)}</time>
                </p>
              )}
            </div>
            {!board.rows.length && <p>No verified results yet.</p>}
            {!!board.rows.length && (
              <div className="leaderboard-grid-wrap">
                <table className="leaderboard-grid">
                  <caption>Verified rankings</caption>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Name</th>
                      <th scope="col">Force cost</th>
                      <th scope="col">Tiles</th>
                      <th scope="col">First solve</th>
                      <th scope="col">Time</th>
                      <th scope="col">Path</th>
                      <th scope="col" aria-label="Replay" />
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map((row) => (
                      <tr
                        className={row.player.id === player.id ? 'your-row' : undefined}
                        key={row.player.id}
                      >
                        <td className="ranking-number">#{row.rank}</td>
                        <th scope="row">{row.player.nickname}</th>
                        <td>{row.metrics.forceCost}</td>
                        <td>{row.metrics.tileCount}</td>
                        <td>#{row.firstSolveAttempts}</td>
                        <td>{(row.metrics.completionTick / 120).toFixed(2)}s</td>
                        <td>{(row.metrics.pathLengthQ / 1024).toFixed(2)}</td>
                        <td>
                          <button
                            className="watch-replay"
                            aria-label={`Watch ${row.player.nickname}’s replay`}
                            ref={(button) => {
                              if (button) watchButtons.current.set(row.player.id, button);
                              else watchButtons.current.delete(row.player.id);
                            }}
                            disabled={!board.replayAccess.available || runActive}
                            onClick={() => {
                              trigger.current = row.player.id;
                              setSelection({
                                target: row.player,
                                viewerId: player.id,
                                puzzleId: puzzle.id,
                                scope,
                              });
                            }}
                          >
                            Watch
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="leaderboard-personal modal-stack">
              {board.me ? (
                <p>
                  Your rank: <strong>#{board.me.rank}</strong>
                </p>
              ) : (
                <p>Solve this course to get a rank.</p>
              )}
            </div>
            {board.nextCursor && (
              <button disabled={busy} onClick={() => void load(true)}>
                Load more standings
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}
