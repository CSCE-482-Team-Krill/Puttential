'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityMapFilters, CommunityMapSummary } from '../../shared/community-maps';
import { communityMapUrl, defaultCommunityMapFilters } from '../../shared/community-maps';
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
  const [draft, setDraft] = useState(defaultCommunityMapFilters);
  const [filters, setFilters] = useState(defaultCommunityMapFilters);
  const filtered = Boolean(
    filters.query || filters.creator || filters.published !== 'all' || filters.sort !== 'newest',
  );
  const controller = useRef<AbortController | null>(null);
  const requestedCursor = useRef<string | undefined>(undefined);
  const load = useCallback(
    async (next?: string) => {
      requestedCursor.current = next;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      setError('');
      try {
        const response = await communityApi.list(next, current.signal, filters);
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
    },
    [filters],
  );
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setLoaded(false);
    void load();
    return () => controller.current?.abort();
  }, [load]);
  function clearFilters() {
    setDraft(defaultCommunityMapFilters);
    setFilters({ ...defaultCommunityMapFilters });
  }
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
      <form
        className="community-filters"
        role="search"
        aria-label="Find community maps"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...draft, query: draft.query.trim(), creator: draft.creator.trim() });
        }}
      >
        <label className="community-search">
          Search maps
          <input
            type="search"
            placeholder="Title, description, or creator"
            maxLength={100}
            value={draft.query}
            onChange={(event) => setDraft({ ...draft, query: event.target.value })}
          />
        </label>
        <label>
          Creator
          <input
            type="search"
            placeholder="Any creator"
            maxLength={40}
            value={draft.creator}
            onChange={(event) => setDraft({ ...draft, creator: event.target.value })}
          />
        </label>
        <label>
          <span id="community-published-label">Published</span>
          <select
            aria-labelledby="community-published-label"
            value={draft.published}
            onChange={(event) =>
              setDraft({
                ...draft,
                published: event.target.value as CommunityMapFilters['published'],
              })
            }
          >
            <option value="all">Any time</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>
        </label>
        <label>
          <span id="community-sort-label">Sort by</span>
          <select
            aria-labelledby="community-sort-label"
            value={draft.sort}
            onChange={(event) =>
              setDraft({ ...draft, sort: event.target.value as CommunityMapFilters['sort'] })
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </label>
        <div className="community-filter-actions">
          <button type="submit">Apply filters</button>
          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </form>
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
        <p className="community-empty">
          {filtered
            ? 'No maps match your search and filters. Try a different search or clear the filters.'
            : 'No community maps yet. Create and publish the first one!'}
        </p>
      )}
      {loaded && !busy && !error && items.length > 0 && (
        <p className="community-results" role="status">
          {items.length} {items.length === 1 ? 'map' : 'maps'} shown
          {cursor ? ' · More available' : ''}
        </p>
      )}
      <div className="community-map-grid" aria-busy={busy}>
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
