'use client';
import { useState } from 'react';
import type { Player, PuzzleProgress } from '../../shared/puzzle-contracts';
import { puzzleApi } from '../api';
import { validNickname } from '../response-validation';

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
      <p>
        Your guest nickname is saved with this browser’s session cookie. Clearing cookies loses
        access; cross-device recovery is unavailable.
      </p>
      {memoryOnly && (
        <p role="status">
          Progress recovery unavailable after refresh. Keep this page open to retry pending saves.
        </p>
      )}
      <form
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
        <label>
          Nickname
          <input
            name="nickname"
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button disabled={busy} type="submit">
          Save nickname
        </button>
      </form>
      <p role="status">{message}</p>
      <h3>Current course</h3>
      {progress ? (
        <>
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
        </>
      ) : (
        <p>Server progress unavailable for this course.</p>
      )}
    </div>
  );
}
