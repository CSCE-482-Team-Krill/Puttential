'use client';
import type { RunResult } from '../puzzle';
import type { PuzzleProgress } from '../../shared/puzzle-contracts';
import type { RecoveryRecord } from '../progress-storage';
import { CopyResult } from './copy-result';
export function ResultPanel({
  result,
  record,
  progress,
  compose,
  retry,
}: {
  result: RunResult | null;
  record: RecoveryRecord | undefined;
  progress: PuzzleProgress | undefined;
  compose: () => Promise<string>;
  retry: () => void;
}) {
  const saved = record?.response?.state === 'saved' ? record.response.result : null;
  const metrics = saved?.metrics;
  return (
    <div className="modal-stack result-body">
      <p>
        {saved
          ? `Server result: ${saved.outcome}`
          : result?.outcome === 'timeout'
            ? 'The simulation reached its time limit.'
            : result?.solved
              ? 'The ball held in the goal.'
              : result?.failure === 'water'
                ? 'The ball sank in water.'
                : result?.failure === 'lava'
                  ? 'The ball burnt in lava.'
                  : 'The ball stopped short of the goal.'}
      </p>
      <p role="status">{record?.message ?? 'Practice — unranked. This result is not submitted.'}</p>
      {result && (
        <div className="result-grid">
          <div>
            <strong>{metrics?.forceCost ?? result.forceCost ?? result.tiles}</strong>
            <span>Force cost</span>
          </div>
          <div>
            <strong>{metrics?.tileCount ?? result.tiles}</strong>
            <span>Tiles</span>
          </div>
          <div>
            <strong>{(metrics ? metrics.completionTick / 120 : result.seconds).toFixed(2)}s</strong>
            <span>Ball time</span>
          </div>
        </div>
      )}
      {metrics && <p>Path {(metrics.pathLengthQ / 1024).toFixed(2)}</p>}
      {saved &&
        result &&
        metrics &&
        ((result.forceCost !== undefined && result.forceCost !== metrics.forceCost) ||
          result.tick !== metrics.completionTick ||
          result.solved !== (saved.outcome === 'success')) && (
          <p>
            The verified replay differs from this device’s provisional result. The server values
            above are authoritative.
          </p>
        )}
      {progress && (
        <p>
          Total accepted starts: {progress.attemptsStarted} ·{' '}
          {progress.firstSolveAttempts === null
            ? 'No verified solve yet'
            : `First verified solve: run #${progress.firstSolveAttempts}`}
        </p>
      )}
      {record && record.phase !== 'terminal' && <button onClick={retry}>Retry save</button>}
      <CopyResult compose={compose} />
      <p className="modal-footnote">
        Close this panel, then choose Try again to adjust your fields.
      </p>
    </div>
  );
}
