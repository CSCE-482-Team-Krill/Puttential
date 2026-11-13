'use client';
import { useEffect, useRef, useState } from 'react';
import type { CommunityMapSummary } from '../../shared/community-maps';
import { communityMapUrl } from '../../shared/community-maps';
import { communityApi } from '../community-api';

export function CommunityPanel({
  choose,
  create,
  notice,
}: {
  choose: (id: string) => void;
  create: () => void;
  notice: string;
}) {
  const [items, setItems] = useState<CommunityMapSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestedCursor = useRef<string | undefined>(undefined);
  async function load(next?: string) {
    requestedCursor.current = next;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError('');
    try {
      const response = await communityApi.list(next, current.signal);
      if (current.signal.aborted) return;
      setItems((old) =>
        next
          ? [...old, ...response.items.filter((item) => !old.some((v) => v.id === item.id))]
          : response.items,
      );
      setCursor(response.nextCursor);
      setLoaded(true);
    } catch (cause) {
      if (!current.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Community could not be loaded.');
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, []);
  return (
    <section className="community-panel" aria-label="Community maps">
      <header className="community-heading">
        <div>
          <h1 id="community-title" tabIndex={-1}>
            Community
          </h1>
        </div>
        <div className="panel-actions">
          <button className="community-create" onClick={create}>
            Create a map
          </button>
          <button disabled={busy} onClick={() => void load()}>
            Refresh maps
          </button>
        </div>
      </header>
      {notice && (
        <p className="api-notice" role="status">
          {notice}
        </p>
      )}
      {busy && <p role="status">Loading community maps…</p>}
      {error && (
        <p role="alert">
          {error}{' '}
          <button disabled={busy} onClick={() => void load(requestedCursor.current)}>
            Retry community
          </button>
        </p>
      )}
      {loaded && !busy && !error && !items.length && (
        <p className="community-empty">No community maps yet. Create and publish the first one!</p>
      )}
      <div className="community-map-grid">
        {items.map((map) => (
          <article key={map.id} className="community-map-card">
            <h2>
              <a
                href={communityMapUrl(map.id)}
                onClick={(event) => {
                  if (
                    event.button ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  choose(map.id);
                }}
              >
                {map.title}
              </a>
            </h2>
            <p className="muted">
              By {map.creatorName} · {new Date(map.createdAt).toLocaleDateString()}
            </p>
            {map.description && <p className="community-description">{map.description}</p>}
            <button onClick={() => choose(map.id)} aria-label={`Play ${map.title}`}>
              Play map
            </button>
          </article>
        ))}
      </div>
      {cursor && (
        <button className="community-load-more" disabled={busy} onClick={() => void load(cursor)}>
          Load more maps
        </button>
      )}
    </section>
  );
}
