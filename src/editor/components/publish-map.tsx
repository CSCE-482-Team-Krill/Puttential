'use client';
import { useRef, useState } from 'react';
import type { LevelDocument } from '../../game';
import type { Placement } from '../../shared/puzzle-contracts';
import type { CommunityMapSummary, PublishCommunityMap } from '../../shared/community-maps';
import { communityMapUrl } from '../../shared/community-maps';
import { defaultRules } from '../../game/run-evaluation';
import { validateCommunityPlacement } from '../../shared/community-placement';

export type MapPublisher = {
  getGuestId(): Promise<string>;
  publish(submission: PublishCommunityMap): Promise<CommunityMapSummary>;
};

type PublishAttempt = { payload: string; requestId: string; guestId: string | null };
type Submission = Omit<PublishCommunityMap, 'requestId' | 'expectedGuestId'>;
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
    validateCommunityPlacement(document.level, defaultRules(document.level), payload.placement);
    return {
      // Older journals have no owner. Retain them without assigning a different guest's identity.
      attempt: {
        payload: attempt.payload as string,
        requestId: attempt.requestId as string,
        guestId: typeof attempt.guestId === 'string' && attempt.guestId ? attempt.guestId : null,
      } as PublishAttempt,
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
  const [attempt, setAttempt] = useState<PublishAttempt | null>(restored?.attempt ?? null);
  const submitting = useRef(false);
  return (
    <form
      className="community-publish"
      aria-label="Publish community map"
      onSubmit={async (event) => {
        event.preventDefault();
        if ((!placement && !attempt) || submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        try {
          // Bind identity before journaling or dispatch; a retry never bootstraps another guest.
          const current = attempt ?? {
            payload: JSON.stringify({ document, placement, title, description }),
            requestId: crypto.randomUUID(),
            guestId: await publish.getGuestId(),
          };
          setAttempt(current);
          if (!current.guestId)
            throw new Error(
              'This older saved publication has no guest identity. Check Community for the original map, or choose Edit publication to start a new submission.',
            );
          const submission = JSON.parse(current.payload) as Submission;
          try {
            sessionStorage.setItem(attemptKey(document), JSON.stringify(current));
          } catch {
            // In-memory retries remain available when browser storage is disabled or full.
          }
          setPublished(
            await publish.publish({
              ...submission,
              requestId: current.requestId,
              expectedGuestId: current.guestId,
            }),
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
            {attempt
              ? 'Your previous submission is saved. Retry it without solving again to recover the same map.'
              : placement
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
              disabled={busy || !!attempt}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Description (optional)
            <textarea
              maxLength={1000}
              value={description}
              disabled={busy || !!attempt}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={(!placement && !attempt) || busy}
          >
            {busy ? 'Verifying and publishing…' : attempt ? 'Retry publication' : 'Publish map'}
          </button>
          {attempt && (
            <>
              <p>
                The previous submission may already be published. Editing starts a new publication.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setAttempt(null);
                  setError('');
                  try {
                    sessionStorage.removeItem(attemptKey(document));
                  } catch {
                    // The current form still supports a fresh submission without storage.
                  }
                }}
              >
                Edit publication
              </button>
            </>
          )}
          {busy && <p role="status">Checking your solution on the server…</p>}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </form>
  );
}
