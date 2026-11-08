'use client';
import { useRef, useState } from 'react';
import type { LevelDocument } from '../../game';
import type { Placement } from '../../shared/puzzle-contracts';
import type { CommunityMapSummary } from '../../shared/community-maps';
import { communityMapUrl } from '../../shared/community-maps';

export type MapPublisher = (
  document: LevelDocument,
  placement: Placement,
  title: string,
  description: string,
  requestId: string,
) => Promise<CommunityMapSummary>;

export function PublishMap({
  document,
  placement,
  publish,
}: {
  document: LevelDocument;
  placement: Placement | null;
  publish: MapPublisher;
}) {
  const [title, setTitle] = useState(document.editor.name);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState<CommunityMapSummary | null>(null);
  const attempt = useRef<{ payload: string; requestId: string } | null>(null);
  const submitting = useRef(false);
  return (
    <form
      className="community-publish"
      aria-label="Publish community map"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!placement || submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        const payload = JSON.stringify({ document, placement, title, description });
        if (attempt.current?.payload !== payload)
          attempt.current = { payload, requestId: crypto.randomUUID() };
        try {
          setPublished(
            await publish(document, placement, title, description, attempt.current.requestId),
          );
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Publishing failed. Please retry.');
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      <h3>Publish to Community</h3>
      {published ? (
        <p role="status">
          Published! <a href={communityMapUrl(published.id)}>Play and share {published.title}</a>
        </p>
      ) : (
        <>
          <p>
            {placement
              ? 'Goal reached! Your solution will be checked before the map is published.'
              : 'Solve this map in playtest to unlock publishing.'}
          </p>
          <label>
            Map title
            <input
              required
              minLength={3}
              maxLength={80}
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Description (optional)
            <textarea
              maxLength={1000}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!placement || busy}>
            {busy ? 'Verifying and publishing…' : 'Publish map'}
          </button>
          {busy && <p role="status">Checking your solution on the server…</p>}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </form>
  );
}
