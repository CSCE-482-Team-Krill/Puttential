import type { RecoveryRecord } from './progress-storage';

/** Active unresolved starts first, then server-accepted runs from newest to oldest. */
export function newestRunRecords(records: RecoveryRecord[], puzzleId: string | undefined) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.start.puzzleId === puzzleId || record.phase !== 'terminal')
    .sort((a, b) => {
      if (!a.record.response && b.record.response) return -1;
      if (a.record.response && !b.record.response) return 1;
      if (a.record.response && b.record.response) {
        const time =
          Date.parse(b.record.response.startedAt) - Date.parse(a.record.response.startedAt);
        if (time) return time;
        const ordinal = b.record.response.attemptOrdinal - a.record.response.attemptOrdinal;
        if (ordinal) return ordinal;
      }
      // Preserve the prior newest-in-memory behavior only when no server ordering is available.
      return b.index - a.index;
    })
    .map(({ record }) => record);
}
