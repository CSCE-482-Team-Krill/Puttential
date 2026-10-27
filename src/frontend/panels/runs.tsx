'use client';

import type { PuzzleProgress } from '../../shared/puzzle-contracts';
import type { RecoveryRecord } from '../progress-storage';
import { CopyResult } from './copy-result';

export function RunsPanel({
  puzzleId,
  progress,
  records,
  localAttempts,
  hasSavedBest,
  compose,
  retry,
  cancel,
  interrupt,
}: {
  puzzleId: string | undefined;
  progress: PuzzleProgress | undefined;
  records: RecoveryRecord[];
  localAttempts: number;
  hasSavedBest: boolean;
  compose: () => Promise<string>;
  retry: (requestId: string) => void;
  cancel: (requestId: string) => void;
  interrupt: (requestId: string) => void;
}) {
  const visible = records
    .filter((r) => r.start.puzzleId === puzzleId || r.phase !== 'terminal')
    .reverse();
  return (
    <div className="runs-content">
      <h2>Runs</h2>
      <dl className="runs-summary">
        <div>
          <dt>{puzzleId ? 'Accepted starts' : 'Practice runs'}</dt>
          <dd>{puzzleId ? (progress?.attemptsStarted ?? 'Unavailable') : localAttempts}</dd>
        </div>
        {progress && (
          <div>
            <dt>First verified solve</dt>
            <dd>
              {progress.firstSolveAttempts === null
                ? 'Not yet solved'
                : `Run #${progress.firstSolveAttempts}`}
            </dd>
          </div>
        )}
      </dl>
      {!puzzleId && <p className="runs-note">Practice runs are unranked and are not submitted.</p>}
      {!visible.length && (
        <p className="runs-note">
          {puzzleId
            ? 'Save status and run details will appear here when you play this course.'
            : 'Play the course to try out your layout.'}
        </p>
      )}
      {visible.length > 0 && (
        <ol className="run-history" aria-label="Saved and pending runs">
          {visible.map((r) => {
            const metrics = r.response?.state === 'saved' ? r.response.result.metrics : null;
            return (
              <li className="modal-row run-card" key={r.start.requestId}>
                <strong>
                  {r.response ? `Run #${r.response.attemptOrdinal}` : 'Pending start'}
                </strong>
                <span className="runs-note">
                  {r.context.date}
                  {r.start.puzzleId !== puzzleId ? ' · Other course' : ''}
                </span>
                <p role="status">{r.message}</p>
                {metrics && (
                  <p className="runs-note">
                    Force {metrics.forceCost} · {metrics.tileCount} tiles ·{' '}
                    {(metrics.completionTick / 120).toFixed(2)}s
                  </p>
                )}
                {r.phase !== 'terminal' && (
                  <div className="panel-actions">
                    <button onClick={() => retry(r.start.requestId)}>Retry run status</button>
                    {!r.intent && (
                      <>
                        <button onClick={() => cancel(r.start.requestId)}>Cancel run</button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                'Recover this run only after closing its original execution. End it as interrupted?',
                              )
                            )
                              interrupt(r.start.requestId);
                          }}
                        >
                          Recover interrupted run
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {hasSavedBest && <CopyResult compose={compose} />}
    </div>
  );
}
