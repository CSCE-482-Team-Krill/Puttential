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

type PublishAttempt = { payload: string; requestId: string };
const attemptKey = (document: LevelDocument) =>
  `puttential-community-publish-v1/${encodeURIComponent(document.level.id)}`;
function restoreAttempt(document: LevelDocument) {
  try {
    const attempt = JSON.parse(sessionStorage.getItem(attemptKey(document)) ?? 'null');
    if (
      !attempt ||
      typeof attempt.payload !== 'string' ||
      typeof attempt.requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attempt.requestId)
    )
      return null;
    const payload = JSON.parse(attempt.payload);
    if (
      typeof payload.title !== 'string' ||
      typeof payload.description !== 'string' ||
      JSON.stringify(payload.document) !== JSON.stringify(document)
    )
      return null;
    return {
      attempt: attempt as PublishAttempt,
      title: payload.title,
      description: payload.description,
    };
  } catch {
    return null;
  }
}

export function PublishMap({
  document,
  placement,
  publish,
}: {
  document: LevelDocument;
  placement: Placement | null;
  publish: MapPublisher;
}) {
  const [restored] = useState(() => restoreAttempt(document));
  const [title, setTitle] = useState(restored?.title ?? document.editor.name);
  const [description, setDescription] = useState(restored?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState<CommunityMapSummary | null>(null);
  const attempt = useRef<PublishAttempt | null>(restored?.attempt ?? null);
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
          // Preserve retries if the server commits but its response is lost or the form closes.
          sessionStorage.setItem(attemptKey(document), JSON.stringify(attempt.current));
        } catch {
          // In-memory retries remain available when browser storage is disabled or full.
        }
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
