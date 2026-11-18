'use client';
import { useState } from 'react';
import type { Player, PuzzleProgress } from '../../shared/puzzle-contracts';
import { puzzleApi } from '../api';
import { LeaderboardTooltip } from '../leaderboard-tooltip';
import { validNickname } from '../response-validation';

const NICKNAME_STORAGE_HELP =
  'Your guest nickname is saved with this browser’s session cookie. Clearing cookies loses access; cross-device recovery is unavailable.';

export function ProfilePanel({
  player,
  progress,
  update,
  retry,
  memoryOnly,
}: {
  player: Player | null;
  progress: PuzzleProgress | undefined;
  update: (player: Player) => void;
  retry: () => void;
  memoryOnly: boolean;
}) {
  const [name, setName] = useState(player?.nickname ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!player)
    return (
      <>
        <p>Competitive guest session unavailable. Practice still works.</p>
        <button onClick={retry}>Retry guest session</button>
      </>
    );
  return (
    <div className="modal-stack">
      {memoryOnly && (
        <p role="status">
          Progress recovery unavailable after refresh. Keep this page open to retry pending saves.
        </p>
      )}
      <form
        className="profile-nickname-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validNickname(name)) {
            setMessage('Use 3–24 visible characters without control characters.');
            return;
          }
          setBusy(true);
          try {
            const confirmed = (await puzzleApi.me()).player;
            if (confirmed.id !== player.id) {
              retry();
              throw new Error('Guest session changed. Retry before editing.');
            }
            const next = (await puzzleApi.nickname(player.id, name.trim())).player;
            if (next.id !== player.id) {
              retry();
              throw new Error('Guest session changed.');
            }
            update(next);
            setMessage('Nickname saved.');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Nickname could not be saved.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="profile-nickname-label">
          <label htmlFor="profile-nickname">Nickname</label>
          <LeaderboardTooltip content={NICKNAME_STORAGE_HELP} className="profile-help">
            {(tooltipProps) => (
              <button type="button" aria-label="About guest nickname storage" {...tooltipProps}>
                ?
              </button>
            )}
          </LeaderboardTooltip>
        </div>
        <div className="profile-nickname-edit">
          <input
            id="profile-nickname"
            name="nickname"
            autoComplete="nickname"
            aria-describedby="nickname-requirements"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button disabled={busy} type="submit">
            Save
          </button>
        </div>
        <p className="profile-nickname-requirements" id="nickname-requirements">
          3–24 visible characters after trimming. Spaces and emoji are allowed; control and
          invisible formatting characters are not.
        </p>
      </form>
      {message && <p role="status">{message}</p>}
      <section className="profile-course" aria-labelledby="current-course-heading">
        <h3 id="current-course-heading">Current course</h3>
        {progress ? (
          <div className="profile-course-stats">
            <p>Total accepted starts: {progress.attemptsStarted}</p>
            <p>
              {progress.firstSolveAttempts === null
                ? 'No verified solve yet.'
                : `First verified solve: run #${progress.firstSolveAttempts}`}
            </p>
            {progress.bestArchive?.metrics && (
              <p>
                Best archive: Force {progress.bestArchive.metrics.forceCost} ·{' '}
                {progress.bestArchive.metrics.tileCount} tiles ·{' '}
                {(progress.bestArchive.metrics.completionTick / 120).toFixed(2)}s · Path{' '}
                {(progress.bestArchive.metrics.pathLengthQ / 1024).toFixed(2)}
              </p>
            )}
          </div>
        ) : (
          <p>Server progress unavailable for this course.</p>
        )}
      </section>
    </div>
  );
}
