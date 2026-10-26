import type {
  LeaderboardResponse,
  PuzzleAvailability,
  SavedResult,
  Scope,
} from '../shared/puzzle-contracts';
export type ShareInput = {
  date: string;
  puzzleId: string;
  guestId: string;
  scope: Scope;
  result: SavedResult;
  firstSolveAttempts: number | null;
  availability: PuzzleAvailability | null;
  board?: LeaderboardResponse | null;
  origin: string;
};
/** Exact run identity is required. Equal metrics never transfer another run's rank. */
export function shareResult(input: ShareInput) {
  const {
    date,
    puzzleId,
    guestId,
    scope,
    result,
    firstSolveAttempts,
    availability,
    board,
    origin,
  } = input;
  const canceled = availability?.publicationStatus === 'canceled';
  const verified = result.verification === 'verified';
  const eligible =
    verified && result.outcome === 'success' && (scope === 'archive' || result.dailyEligible);
  const hasRank =
    availability?.puzzleId === puzzleId &&
    !canceled &&
    eligible &&
    board?.puzzleId === puzzleId &&
    board.scope === scope &&
    board.viewerGuestId === guestId &&
    board.me?.player.id === guestId &&
    board.me.bestRunId === result.runId &&
    board.availability.publicationStatus === 'active' &&
    BigInt(board.availability.revision) >= BigInt(availability.revision);
  const lines = [
    `Puttential — ${date} — ${scope === 'daily' ? 'Daily' : 'Archive'} ${result.outcome === 'success' ? 'solved' : result.outcome}`,
    verified ? 'Verified historical result' : 'Unverified result',
  ];
  if (result.metrics) {
    lines.push(
      `Force ${result.metrics.forceCost} · Tiles ${result.metrics.tileCount}${firstSolveAttempts === null ? '' : ` · First verified solve: run #${firstSolveAttempts}`}`,
    );
    lines.push(`Ball time ${(result.metrics.completionTick / 120).toFixed(2)}s`);
  }
  if (canceled) lines.push('Course canceled — historical result only');
  else if (!availability) lines.push('Ranking status unavailable');
  else if (scope === 'daily' && !result.dailyEligible) lines.push('Saved outside daily window');
  if (hasRank)
    lines.push(
      `${scope === 'daily' ? 'Daily' : 'Archive'} rank #${board.me!.rank} · ${board.me!.percentile.toFixed(1)}% strictly behind · as of ${board.asOf}`,
    );
  lines.push(`${origin.replace(/\/$/, '')}/?date=${date}`);
  return lines.join('\n');
}
