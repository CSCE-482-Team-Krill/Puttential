'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  BoardView,
  LeaderboardResponse,
  Player,
  PuzzleResponse,
  Scope,
} from '../../shared/puzzle-contracts';
import { puzzleApi } from '../api';
import { Icon } from '../icon';
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

function formatCompactPuzzleDate(dateString: string) {
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const COLUMN_HELP = {
  rank: 'Overall position after all ranking tie-breakers. Tied scores share a rank.',
  name: 'Player nickname.',
  cost: 'Total force cost. Lower values rank better.',
  tiles: 'Number of enabled force tiles. Fewer tiles rank better.',
  attempts: "Run number of the player's first verified solve. Fewer attempts rank better.",
  time: 'Simulated completion time in seconds. Faster times rank better.',
  path: 'Distance traveled by the goal ball. Shorter paths rank better.',
  replay: "Watch this player's best verified solution.",
} as const;

function ColumnLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="leaderboard-column-label" title={help} aria-label={`${label}. ${help}`}>
      {label}
    </span>
  );
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
  const [displayBoard, setDisplayBoard] = useState<LeaderboardResponse | null>(null);
  const [pageInput, setPageInput] = useState('1');
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
  async function load(page = window?.board?.page) {
    if (!window) return;
    setBusy(true);
    await window.load(page);
    if (window.board) {
      try {
        state.applyAvailability(window.board.availability);
      } catch {
        window.message = 'Course status changed. Refresh required.';
        window.board = null;
      }
    }
    if (window.board) setDisplayBoard(window.board);
    else if (window.message) setDisplayBoard(null);
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
  const board = displayBoard;
  useEffect(() => {
    if (board) setPageInput(String(board.page));
  }, [board?.page, board?.scope, board?.view]);
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
  function submitPage() {
    if (!board || !/^\d+$/.test(pageInput)) {
      if (board) setPageInput(String(board.page));
      return;
    }
    const requested = Number(pageInput);
    if (!Number.isSafeInteger(requested)) {
      setPageInput(String(board.page));
      return;
    }
    const page = Math.min(board.totalPages, Math.max(1, requested));
    setPageInput(String(page));
    if (page !== board.page) void load(page);
  }
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
                  disabled={busy}
                  onChange={() => setScope(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
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
              {(puzzle.communityMapId || board.scope === 'daily') && (
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
            <div className="leaderboard-personal">
              {board.me ? (
                <p>
                  Your rank: <strong>{board.me.rank}</strong>
                </p>
              ) : board.scope === 'daily' && puzzle.date ? (
                <p>You did not play this course on {formatPuzzleDate(puzzle.date)}.</p>
              ) : (
                <p>Solve this course to get a rank.</p>
              )}
            </div>
            <div className="leaderboard-toolbar">
              {puzzle.date && (
                <time dateTime={puzzle.date}>{formatCompactPuzzleDate(puzzle.date)}</time>
              )}
              <div className="leaderboard-view-actions">
                <button
                  type="button"
                  aria-label="Top"
                  title="Top rankings"
                  aria-pressed={view === 'top'}
                  disabled={busy}
                  onClick={() => setView('top')}
                >
                  <Icon name="up" size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Around me"
                  title="Rankings around me"
                  aria-pressed={view === 'around-me'}
                  disabled={busy}
                  onClick={() => setView('around-me')}
                >
                  <Icon name="profile" size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Refresh standings"
                  title="Refresh standings"
                  disabled={busy}
                  onClick={() => void load()}
                >
                  <Icon name="refresh" size={18} />
                </button>
              </div>
            </div>
            {!board.rows.length && <p>No verified results yet.</p>}
            {!!board.rows.length && (
              <div className="leaderboard-grid-wrap">
                <table className="leaderboard-grid">
                  <caption>Verified rankings</caption>
                  <colgroup>
                    <col className="leaderboard-col-rank" />
                    <col className="leaderboard-col-name" />
                    <col className="leaderboard-col-cost" />
                    <col className="leaderboard-col-tiles" />
                    <col className="leaderboard-col-attempts" />
                    <col className="leaderboard-col-time" />
                    <col className="leaderboard-col-path" />
                    <col className="leaderboard-col-replay" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">
                        <ColumnLabel label="Rank" help={COLUMN_HELP.rank} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Name" help={COLUMN_HELP.name} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Cost" help={COLUMN_HELP.cost} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Tiles" help={COLUMN_HELP.tiles} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Attempts" help={COLUMN_HELP.attempts} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Time" help={COLUMN_HELP.time} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Path" help={COLUMN_HELP.path} />
                      </th>
                      <th scope="col">
                        <span
                          className="leaderboard-column-label"
                          title={COLUMN_HELP.replay}
                          aria-label={`Replay. ${COLUMN_HELP.replay}`}
                        >
                          <Icon name="eye" size={16} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map((row) => (
                      <tr
                        className={row.player.id === player.id ? 'your-row' : undefined}
                        key={row.player.id}
                      >
                        <td className="ranking-number">{row.rank}</td>
                        <th scope="row">{row.player.nickname}</th>
                        <td>{row.metrics.forceCost}</td>
                        <td>{row.metrics.tileCount}</td>
                        <td>{row.firstSolveAttempts}</td>
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
                            disabled={!board.replayAccess.available || runActive || busy}
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
                            <Icon name="eye" size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {board.totalPages > 1 && (
              <nav
                className="calendar-navigation leaderboard-pagination"
                aria-label="Leaderboard pages"
              >
                <button
                  type="button"
                  aria-label="First page"
                  title="First page"
                  disabled={busy || board.page === 1}
                  onClick={() => void load(1)}
                >
                  «
                </button>
                <button
                  type="button"
                  aria-label="Previous page"
                  title="Previous page"
                  disabled={busy || board.page === 1}
                  onClick={() => void load(board.page - 1)}
                >
                  ‹
                </button>
                <form
                  className="calendar-period leaderboard-page-input"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitPage();
                  }}
                >
                  <label>
                    <span>Page</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Leaderboard page"
                      value={pageInput}
                      disabled={busy}
                      onChange={(event) => {
                        if (/^\d*$/.test(event.target.value)) setPageInput(event.target.value);
                      }}
                      onBlur={submitPage}
                    />
                    <span>of {board.totalPages}</span>
                  </label>
                </form>
                <button
                  type="button"
                  aria-label="Next page"
                  title="Next page"
                  disabled={busy || board.page === board.totalPages}
                  onClick={() => void load(board.page + 1)}
                >
                  ›
                </button>
                <button
                  type="button"
                  aria-label="Last page"
                  title="Last page"
                  disabled={busy || board.page === board.totalPages}
                  onClick={() => void load(board.totalPages)}
                >
                  »
                </button>
              </nav>
            )}
          </>
        )
      )}
    </div>
  );
}
