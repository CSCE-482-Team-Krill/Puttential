'use client';
import { useEffect, useMemo, useState } from 'react';
import type { BoardView, Player, PuzzleResponse, Scope } from '../../shared/puzzle-contracts';
import { puzzleApi } from '../api';
import { LeaderboardWindow } from '../leaderboard-state';
import type { AuthoritativeState } from '../authoritative-state';

export function LeaderboardPanel({
  puzzle,
  player,
  state,
  reconcileGuest,
}: {
  puzzle: PuzzleResponse | undefined;
  player: Player | null;
  state: AuthoritativeState;
  reconcileGuest: () => void;
}) {
  const [scope, setScope] = useState<Scope>(
    puzzle?.date === puzzle?.todayDate ? 'daily' : 'archive',
  );
  const [view, setView] = useState<BoardView>('top');
  const [busy, setBusy] = useState(false);
  const [, update] = useState(0);
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
  useEffect(() => {
    void load();
    return () => window?.cancel();
  }, [window]);
  if (!puzzle) return <p>Choose a published dated course to view its leaderboard.</p>;
  if (!player)
    return (
      <p>
        Leaderboard unavailable until your guest session is confirmed. Practice remains available.
      </p>
    );
  const board = window?.board;
  const availability = state.availability.get(puzzle.id) ?? puzzle.availability;
  const canceled = availability.publicationStatus === 'canceled';
  return (
    <div className="modal-stack">
      <label>
        Board
        <select
          aria-label="Leaderboard scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
        >
          <option value="daily">Original daily leaderboard</option>
          <option value="archive">All-time archive leaderboard</option>
        </select>
      </label>
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
      {busy && <p role="status">Loading standings…</p>}
      {window?.message && <p role="alert">{window.message}</p>}
      {canceled ? (
        <p role="status">
          Course canceled. {availability.cancellationMessage} Competitive rankings are unavailable.
        </p>
      ) : (
        board && (
          <>
            <p className="modal-footnote">
              {scope === 'archive'
                ? 'Archive — open'
                : board.final
                  ? 'Final'
                  : board.submissionClosed
                    ? 'Closed — verification pending'
                    : 'Open — provisional'}
            </p>
            <p>
              {board.totalPlayers} ranked players · As of {board.asOf}
            </p>
            {!board.rows.length && <p>No verified results yet.</p>}
            <ol className="modal-stack ranking-list" aria-label="Verified rankings">
              {board.rows.map((row) => (
                <li className="modal-row ranking-row" key={row.player.id}>
                  <span className="ranking-number">#{row.rank}</span>
                  <span className="ranking-player">
                    <strong>{row.player.nickname}</strong>
                    <small>
                      {row.metrics.tileCount} tiles · First solve: run #{row.firstSolveAttempts} ·{' '}
                      {(row.metrics.completionTick / 120).toFixed(2)}s · Path{' '}
                      {(row.metrics.pathLengthQ / 1024).toFixed(2)}
                    </small>
                  </span>
                  <span className="ranking-score">
                    {row.metrics.forceCost}
                    <small>pt</small>
                  </span>
                </li>
              ))}
            </ol>
            <p>
              {board.me
                ? `Your rank: #${board.me.rank}. ${board.me.percentile.toFixed(1)}% of ranked players are strictly behind you. Ties share rank.`
                : 'Solve this course to get a rank.'}
            </p>
            <p className="modal-footnote">
              Percentile uses all {board.totalPlayers} ranked players in this board, including ties.
            </p>
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
