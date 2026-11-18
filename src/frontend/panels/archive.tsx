'use client';
import { useEffect, useRef, useState } from 'react';
import type { ArchiveItem, Player } from '../../shared/puzzle-contracts';
import { puzzleApi } from '../api';
import type { AuthoritativeState } from '../authoritative-state';
import {
  archiveMonthRange,
  archiveYears,
  canShiftMonth,
  canShiftYear,
  clampMonth,
  monthInRange,
  monthParts,
  monthValue,
  shiftMonth,
  shiftYear,
} from '../archive-calendar';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function initialMonth(date: string | undefined, range: ReturnType<typeof archiveMonthRange>) {
  return clampMonth(date?.slice(0, 7) ?? new Date().toISOString().slice(0, 7), range);
}

export function ArchivePanel({
  player,
  date,
  today,
  state,
  choose,
  reconcileGuest,
}: {
  player: Player | null;
  date?: string;
  today?: string;
  state: AuthoritativeState;
  choose: (date: string) => void;
  reconcileGuest: () => void;
}) {
  const range = archiveMonthRange(today);
  const [month, setMonth] = useState(() => initialMonth(date, range));
  const [rows, setRows] = useState<ArchiveItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  async function load() {
    const token = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    if (!player) {
      setBusy(false);
      setRows([]);
      setError('Archive unavailable until your guest session is confirmed.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const items: ArchiveItem[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const response = await puzzleApi.archive(month, cursor, {
          signal: controller.current.signal,
        });
        if (token !== generation.current) return;
        if (response.guestId !== player.id) {
          reconcileGuest();
          throw new Error('Guest session changed. Refresh the archive.');
        }
        for (const item of response.items) {
          state.applyAvailability(item.availability);
          const known = state.progress.get(`${player.id}/${item.id}`);
          if (known && BigInt(known.revision) > BigInt(item.progressRevision)) {
            // Summary cannot replace detailed progress; refresh that domain independently.
            void puzzleApi
              .progress(item.id)
              .then((progress) => {
                if (progress.progress.guestId === player.id) {
                  state.applyProgress(progress.progress);
                  state.applyAvailability(progress.availability);
                  if (token === generation.current) setRows((current) => [...current]);
                }
              })
              .catch(() => {});
          }
        }
        items.push(...response.items);
        cursor = response.nextCursor;
        if (cursor) {
          if (cursors.has(cursor)) throw new Error('Archive pagination did not advance.');
          cursors.add(cursor);
        }
      } while (cursor);
      setRows([...new Map(items.map((item) => [item.id, item])).values()]);
    } catch (cause) {
      if (token === generation.current)
        setError(cause instanceof Error ? cause.message : 'Archive unavailable.');
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      ++generation.current;
      controller.current?.abort();
    };
  }, [player?.id, month]);
  useEffect(() => {
    setMonth((current) => clampMonth(current, range));
  }, [range.min, range.max]);

  const { year, monthIndex } = monthParts(month);
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const trailingDays = 42 - firstWeekday - daysInMonth;
  const byDate = new Map(rows.map((item) => [item.date, item]));
  const years = archiveYears(range);

  return (
    <section className="modal-stack published-archive" aria-label="Daily archive">
      <div className="calendar-navigation" aria-label="Calendar navigation">
        <button
          aria-label="Previous year"
          title="Previous year"
          disabled={!canShiftYear(month, -1, range)}
          onClick={() => setMonth(shiftYear(month, -1, range))}
        >
          «
        </button>
        <button
          aria-label="Previous month"
          title="Previous month"
          disabled={!canShiftMonth(month, -1, range)}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <div className="calendar-period">
          <select
            aria-label="Calendar month"
            value={monthIndex}
            onChange={(event) =>
              setMonth(clampMonth(monthValue(year, Number(event.target.value)), range))
            }
          >
            {MONTH_NAMES.map((name, index) => (
              <option
                key={name}
                value={index}
                disabled={!monthInRange(monthValue(year, index), range)}
              >
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Calendar year"
            value={year}
            onChange={(event) =>
              setMonth(clampMonth(monthValue(Number(event.target.value), monthIndex), range))
            }
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <button
          aria-label="Next month"
          title="Next month"
          disabled={!canShiftMonth(month, 1, range)}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
        <button
          aria-label="Next year"
          title="Next year"
          disabled={!canShiftYear(month, 1, range)}
          onClick={() => setMonth(shiftYear(month, 1, range))}
        >
          »
        </button>
      </div>
      <div
        className="calendar-grid"
        role="grid"
        aria-label={`${MONTH_NAMES[monthIndex]} ${year}`}
        aria-busy={busy}
      >
        {WEEKDAYS.map((weekday) => (
          <span className="calendar-weekday" role="columnheader" key={weekday}>
            {weekday}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, index) => (
          <span
            className="calendar-day calendar-day-outside"
            aria-hidden="true"
            key={`before-${index}`}
          />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const itemDate = `${month}-${String(day).padStart(2, '0')}`;
          const item = byDate.get(itemDate);
          if (!item)
            return (
              <span className="calendar-day calendar-day-empty" key={itemDate}>
                {day}
              </span>
            );
          const progress = state.progress.get(`${player?.id}/${item.id}`);
          const availability = state.availability.get(item.id) ?? item.availability;
          const status =
            availability.publicationStatus === 'canceled'
              ? 'canceled'
              : progress
                ? progress.firstSolveAttempts !== null
                  ? 'solved'
                  : progress.attemptsStarted
                    ? 'attempted'
                    : 'unplayed'
                : item.status;
          const column = (firstWeekday + index) % 7;
          return (
            <button
              className={`calendar-day calendar-day-puzzle calendar-column-${column} ${status === 'solved' ? 'solved' : ''} ${item.date === date ? 'current' : ''}`}
              key={item.id}
              data-date={item.date}
              aria-current={item.date === date ? 'date' : undefined}
              aria-label={`${item.date}: ${item.title}, ${status}`}
              onClick={() => choose(item.date)}
            >
              <span aria-hidden="true">{day}</span>
              <span className="calendar-tooltip" role="tooltip">
                {item.title}
              </span>
            </button>
          );
        })}
        {Array.from({ length: trailingDays }, (_, index) => (
          <span
            className="calendar-day calendar-day-outside"
            aria-hidden="true"
            key={`after-${index}`}
          />
        ))}
      </div>
      <div className="calendar-legend" aria-label="Calendar legend">
        <span>
          <i className="puzzle" /> Puzzle
        </span>
        <span>
          <i className="solved" /> Solved
        </span>
      </div>
      {busy && (
        <span className="sr-only" role="status">
          Loading {MONTH_NAMES[monthIndex]} courses…
        </span>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button disabled={busy} onClick={() => void load()}>
            Retry archive
          </button>
        </div>
      )}
    </section>
  );
}
