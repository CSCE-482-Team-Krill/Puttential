'use client';
import { useEffect, useRef, useState } from 'react';
import type { ArchiveItem, Player } from '../../shared/puzzle-contracts';
import { puzzleApi } from '../api';
import type { AuthoritativeState } from '../authoritative-state';

export function ArchivePanel({
  player,
  date,
  state,
  choose,
  reconcileGuest,
}: {
  player: Player | null;
  date?: string;
  state: AuthoritativeState;
  choose: (date: string) => void;
  reconcileGuest: () => void;
}) {
  const [month, setMonth] = useState('');
  const [rows, setRows] = useState<ArchiveItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  async function load(more = false) {
    const token = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    if (!player) {
      setRows([]);
      setError('Archive unavailable until your guest session is confirmed.');
      return;
    }
    setBusy(true);
    setError('');
    if (!more) {
      setRows([]);
      setCursor(null);
    }
    try {
      const response = await puzzleApi.archive(month, more ? cursor : null, {
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
            .then((p) => {
              if (p.progress.guestId === player.id) {
                state.applyProgress(p.progress);
                state.applyAvailability(p.availability);
              }
            })
            .catch(() => {});
        }
      }
      setRows((current) => {
        const combined = more ? [...current, ...response.items] : response.items;
        return [...new Map(combined.map((item) => [item.id, item])).values()];
      });
      setCursor(response.nextCursor);
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : 'Archive unavailable.');
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
  return (
    <section className="modal-stack" aria-label="Daily archive">
      <h3>Daily archive</h3>
      <label>
        Month
        <input
          aria-label="Archive month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {busy && <p role="status">Loading archive…</p>}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={() => void load()}>
        Retry archive
      </button>
      {!busy && !error && !rows.length && <p>No published courses for this month.</p>}
      {rows.map((item) => {
        const progress = state.progress.get(`${player?.id}/${item.id}`);
        const availability = state.availability.get(item.id) ?? item.availability;
        const status =
          availability.publicationStatus === 'canceled'
            ? 'Canceled'
            : progress
              ? progress.firstSolveAttempts !== null
                ? 'solved'
                : progress.attemptsStarted
                  ? 'attempted'
                  : 'unplayed'
              : item.status;
        return (
          <button
            className="modal-row archive-row"
            key={item.id}
            aria-current={item.date === date ? 'true' : undefined}
            onClick={() => choose(item.date)}
          >
            <span className="archive-course">
              <strong>{item.title}</strong>
              <small>
                {item.date} · Difficulty {item.difficulty} · {status}
              </small>
              {availability.publicationStatus === 'canceled' && (
                <small>{availability.cancellationMessage}</small>
              )}
            </span>
            <span>Open</span>
          </button>
        );
      })}
      {cursor && (
        <button disabled={busy} onClick={() => void load(true)}>
          Load more courses
        </button>
      )}
    </section>
  );
}
