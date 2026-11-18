'use client';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
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

const LEADERBOARD_TOOLTIP_TEXT = {
  sharing: {
    community: 'Verified community solutions are shared automatically. Rankings remain open.',
    daily:
      'Leaderboard solutions are shared automatically after daily close. Archive rankings remain open.',
  },
  actions: {
    top: 'Top rankings',
    aroundMe: 'Rankings around me',
    refresh: 'Refresh standings',
  },
  columns: {
    rank: 'Overall position after all ranking tie-breakers. Tied scores share a rank.',
    name: 'Player nickname.',
    cost: 'Total force cost. Lower values rank better.',
    tiles: 'Number of enabled force tiles. Fewer tiles rank better.',
    attempts: "Run number of the player's first verified solve. Fewer attempts rank better.",
    time: 'Simulated completion time in seconds. Faster times rank better.',
    path: 'Distance traveled by the goal ball. Shorter paths rank better.',
    replay: "Watch this player's best verified solution.",
  },
} as const;

type TooltipTriggerProps = { 'aria-describedby': string };

function LeaderboardTooltip({
  content,
  className = '',
  children,
}: {
  content: string;
  className?: string;
  children: (props: TooltipTriggerProps) => ReactNode;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: -9999, top: -9999, above: false });
  const place = useCallback(() => {
    if (!anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const width = tooltip.current?.offsetWidth ?? 240;
    const height = tooltip.current?.offsetHeight ?? 40;
    const above = rect.bottom + height + 8 > globalThis.innerHeight && rect.top > height + 8;
    setPosition({
      left: Math.min(
        globalThis.innerWidth - width / 2 - 8,
        Math.max(width / 2 + 8, rect.left + rect.width / 2),
      ),
      top: above ? rect.top - 7 : rect.bottom + 7,
      above,
    });
  }, []);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, content]);
  useEffect(() => {
    if (!open) return;
    globalThis.addEventListener('resize', place);
    globalThis.addEventListener('scroll', place, true);
    return () => {
      globalThis.removeEventListener('resize', place);
      globalThis.removeEventListener('scroll', place, true);
    };
  }, [open, place]);
  return (
    <span
      className={`leaderboard-tooltip-anchor ${className}`.trim()}
      ref={anchor}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {children({ 'aria-describedby': id })}
      {open &&
        createPortal(
          <span
            className="leaderboard-floating-tooltip"
            id={id}
            role="tooltip"
            ref={tooltip}
            data-placement={position.above ? 'above' : 'below'}
            style={{ left: position.left, top: position.top }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

function ColumnLabel({
  label,
  help,
  children = label,
}: {
  label: string;
  help: string;
  children?: ReactNode;
}) {
  return (
    <LeaderboardTooltip content={help}>
      {(tooltipProps) => (
        <span
          className="leaderboard-column-label"
          tabIndex={0}
          aria-label={label}
          {...tooltipProps}
        >
          {children}
        </span>
      )}
    </LeaderboardTooltip>
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
  const displayBoardRef = useRef<LeaderboardResponse | null>(null);
  const [pageInput, setPageInput] = useState('1');
  const [pageSize, setPageSize] = useState(10);
  const [, update] = useState(0);
  const [selection, setSelection] = useState<{
    target: Player;
    viewerId: string;
    puzzleId: string;
    scope: Scope;
  } | null>(null);
  const trigger = useRef<string | null>(null);
  const watchButtons = useRef(new Map<string, HTMLButtonElement>());
  const pagination = useRef<HTMLElement>(null);
  const latestLoad = useRef(() => {});
  const window = useMemo(
    () =>
      puzzle && player
        ? new LeaderboardWindow(
            puzzleApi,
            player.id,
            puzzle.id,
            scope,
            view,
            reconcileGuest,
            pageSize,
          )
        : null,
    [puzzle?.id, player?.id, scope, view, reconcileGuest, pageSize],
  );
  async function load(page = window?.board?.page, preservePagination = false) {
    if (!window) return;
    const anchor = preservePagination ? pagination.current : null;
    const scrollContainer = anchor?.closest<HTMLElement>('.modal-body') ?? null;
    const anchorTop = anchor?.getBoundingClientRect().top;
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
    if (window.board) {
      displayBoardRef.current = window.board;
      setDisplayBoard(window.board);
    } else if (window.message) {
      displayBoardRef.current = null;
      setDisplayBoard(null);
    }
    setBusy(false);
    update((n) => n + 1);
    if (scrollContainer && anchorTop !== undefined)
      requestAnimationFrame(() => {
        if (!pagination.current) return;
        scrollContainer.scrollTop += pagination.current.getBoundingClientRect().top - anchorTop;
        pagination.current
          .querySelector<HTMLInputElement>('input[aria-label="Leaderboard page"]')
          ?.focus({ preventScroll: true });
      });
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
    const currentBoard = displayBoardRef.current;
    if (busy) return;
    if (!currentBoard || !/^\d+$/.test(pageInput)) {
      if (currentBoard) setPageInput(String(currentBoard.page));
      return;
    }
    const requested = Number(pageInput);
    if (!Number.isSafeInteger(requested)) {
      setPageInput(String(currentBoard.page));
      return;
    }
    const page = Math.min(currentBoard.totalPages, Math.max(1, requested));
    setPageInput(String(page));
    if (page !== currentBoard.page) void load(page, true);
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
      <div className="leaderboard-scope-row">
        {puzzle.communityMapId ? (
          <p>Community leaderboard — all-time</p>
        ) : (
          <fieldset className="leaderboard-scope" aria-label="Leaderboard scope">
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
        <LeaderboardTooltip
          className="leaderboard-help"
          content={
            puzzle.communityMapId
              ? LEADERBOARD_TOOLTIP_TEXT.sharing.community
              : LEADERBOARD_TOOLTIP_TEXT.sharing.daily
          }
        >
          {(tooltipProps) => (
            <button type="button" aria-label="About leaderboard sharing" {...tooltipProps}>
              ?
            </button>
          )}
        </LeaderboardTooltip>
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
                <LeaderboardTooltip
                  className="leaderboard-action-tooltip"
                  content={LEADERBOARD_TOOLTIP_TEXT.actions.top}
                >
                  {(tooltipProps) => (
                    <button
                      type="button"
                      aria-label="Top"
                      aria-pressed={view === 'top'}
                      disabled={busy}
                      onClick={() => setView('top')}
                      {...tooltipProps}
                    >
                      <Icon name="up" size={18} />
                    </button>
                  )}
                </LeaderboardTooltip>
                <LeaderboardTooltip
                  className="leaderboard-action-tooltip"
                  content={LEADERBOARD_TOOLTIP_TEXT.actions.aroundMe}
                >
                  {(tooltipProps) => (
                    <button
                      type="button"
                      aria-label="Around me"
                      aria-pressed={view === 'around-me'}
                      disabled={busy}
                      onClick={() => setView('around-me')}
                      {...tooltipProps}
                    >
                      <Icon name="profile" size={18} />
                    </button>
                  )}
                </LeaderboardTooltip>
                <LeaderboardTooltip
                  className="leaderboard-action-tooltip"
                  content={LEADERBOARD_TOOLTIP_TEXT.actions.refresh}
                >
                  {(tooltipProps) => (
                    <button
                      type="button"
                      aria-label="Refresh standings"
                      disabled={busy}
                      onClick={() => void load()}
                      {...tooltipProps}
                    >
                      <Icon name="refresh" size={19} />
                    </button>
                  )}
                </LeaderboardTooltip>
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
                        <ColumnLabel label="Rank" help={LEADERBOARD_TOOLTIP_TEXT.columns.rank} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Name" help={LEADERBOARD_TOOLTIP_TEXT.columns.name} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Cost" help={LEADERBOARD_TOOLTIP_TEXT.columns.cost} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Tiles" help={LEADERBOARD_TOOLTIP_TEXT.columns.tiles} />
                      </th>
                      <th scope="col">
                        <ColumnLabel
                          label="Attempts"
                          help={LEADERBOARD_TOOLTIP_TEXT.columns.attempts}
                        />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Time" help={LEADERBOARD_TOOLTIP_TEXT.columns.time} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Path" help={LEADERBOARD_TOOLTIP_TEXT.columns.path} />
                      </th>
                      <th scope="col">
                        <ColumnLabel label="Replay" help={LEADERBOARD_TOOLTIP_TEXT.columns.replay}>
                          <Icon name="eye" size={16} />
                        </ColumnLabel>
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
                            aria-label={
                              board.replayAccess.available
                                ? `Watch ${row.player.nickname}’s replay`
                                : `${row.player.nickname}’s replay is unavailable`
                            }
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
                            <Icon
                              name={board.replayAccess.available ? 'eye' : 'eye-off'}
                              size={18}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {board.totalPlayers > 0 && (
              <nav
                className="leaderboard-pagination"
                aria-label="Leaderboard pages"
                ref={pagination}
              >
                <div className="leaderboard-page-controls">
                  <button
                    type="button"
                    aria-label="First page"
                    title="First page"
                    disabled={busy || board.page === 1}
                    onClick={() => void load(1, true)}
                  >
                    «
                  </button>
                  <button
                    type="button"
                    aria-label="Previous page"
                    title="Previous page"
                    disabled={busy || board.page === 1}
                    onClick={() => void load(board.page - 1, true)}
                  >
                    ‹
                  </button>
                  <form
                    className="leaderboard-page-input"
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
                        readOnly={busy}
                        aria-busy={busy}
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
                    onClick={() => void load(board.page + 1, true)}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    aria-label="Last page"
                    title="Last page"
                    disabled={busy || board.page === board.totalPages}
                    onClick={() => void load(board.totalPages, true)}
                  >
                    »
                  </button>
                </div>
                <label className="leaderboard-page-size">
                  <span>Rows per page</span>
                  <select
                    aria-label="Rows per leaderboard page"
                    value={pageSize}
                    disabled={busy}
                    onChange={(event) => {
                      setPageInput('1');
                      setPageSize(Number(event.target.value));
                    }}
                  >
                    {[10, 20, 50].map((size) => (
                      <option value={size} key={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </nav>
            )}
          </>
        )
      )}
    </div>
  );
}
