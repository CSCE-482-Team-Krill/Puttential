/** Pure v4 lifecycle contract. DB claims and physical unit control must enforce it independently. */
export const EXECUTION_BUDGET_MS = 5000;
export const QUEUE_AGE_MS = 120_000;
export type Assignment = {
  jobId: string;
  runnerGeneration: string;
  unitNumber: 0 | 1;
  attemptFence: string;
  attemptNumber: number;
};
export type ExitEvidence = {
  elapsedMs: number;
  exitCode: number | null;
  groupEmpty: boolean;
  timeout: boolean;
  oom: boolean;
  canceled: boolean;
  terminationFailed: boolean;
};
export function canAcceptExecution(evidence: ExitEvidence): boolean {
  return (
    Number.isFinite(evidence.elapsedMs) &&
    evidence.elapsedMs >= 0 &&
    evidence.elapsedMs <= EXECUTION_BUDGET_MS &&
    evidence.exitCode === 0 &&
    evidence.groupEmpty &&
    !evidence.timeout &&
    !evidence.oom &&
    !evidence.canceled &&
    !evidence.terminationFailed
  );
}
export function sameAssignment(a: Assignment, b: Assignment): boolean {
  return (
    a.jobId === b.jobId &&
    a.runnerGeneration === b.runnerGeneration &&
    a.unitNumber === b.unitNumber &&
    a.attemptFence === b.attemptFence &&
    a.attemptNumber === b.attemptNumber
  );
}
export function mayReleaseReservation(
  held: Assignment,
  finished: Assignment,
  groupEmpty: boolean,
): boolean {
  return groupEmpty && sameAssignment(held, finished);
}
export function mayStartAttempt(admittedAt: number, databaseNow: number): boolean {
  return (
    Number.isFinite(admittedAt) &&
    Number.isFinite(databaseNow) &&
    databaseNow >= admittedAt &&
    databaseNow < admittedAt + QUEUE_AGE_MS
  );
}
export type RetryDecision =
  | { state: 'retry-wait'; readyAt: number }
  | { state: 'operator-action' }
  | { state: 'terminal'; code: 'QUEUE_AGE' | 'RESOURCE_BUDGET' | 'PROOF_FAILED' | 'attempt-limit' };
export function retryAfterAttempt(input: {
  admittedAt: number;
  finishedAt: number;
  attemptNumber: number;
  confirmedExit: boolean;
  failure: 'infrastructure' | 'resource' | 'proof';
  operatorRetry: boolean;
}): RetryDecision {
  if (
    !Number.isSafeInteger(input.attemptNumber) ||
    input.attemptNumber < 1 ||
    input.attemptNumber > 5 ||
    !Number.isFinite(input.admittedAt) ||
    !Number.isFinite(input.finishedAt) ||
    input.finishedAt < input.admittedAt
  )
    throw new Error('Invalid retry evidence');
  if (!input.confirmedExit) return { state: 'operator-action' };
  if (input.failure !== 'infrastructure')
    return {
      state: 'terminal',
      code: input.failure === 'resource' ? 'RESOURCE_BUDGET' : 'PROOF_FAILED',
    };
  if (input.attemptNumber >= 5) return { state: 'terminal', code: 'attempt-limit' };
  if (!mayStartAttempt(input.admittedAt, input.finishedAt))
    return { state: 'terminal', code: 'QUEUE_AGE' };
  if (input.attemptNumber >= 3 && !input.operatorRetry) return { state: 'operator-action' };
  const backoff = input.operatorRetry ? 0 : input.attemptNumber === 1 ? 5000 : 30_000;
  const readyAt = input.finishedAt + backoff;
  return mayStartAttempt(input.admittedAt, readyAt)
    ? { state: 'retry-wait', readyAt }
    : { state: 'terminal', code: 'QUEUE_AGE' };
}
export type CompletedAttempt = Assignment & {
  artifactDigest: string;
  startedAt: string;
  finishedAt: string;
  evidence: ExitEvidence;
  outcome: string;
  resultHash: string;
};
export function appendAttempt(
  history: readonly CompletedAttempt[],
  current: Assignment,
  completion: CompletedAttempt,
): readonly CompletedAttempt[] {
  if (!sameAssignment(current, completion)) throw new Error('Stale attempt fence');
  const existing = history.find((attempt) => attempt.attemptNumber === completion.attemptNumber);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(completion))
      throw new Error('Conflicting completed attempt');
    return history;
  }
  if (
    !completion.evidence.groupEmpty ||
    history.length >= 5 ||
    completion.attemptNumber !== history.length + 1
  )
    throw new Error('Invalid attempt journal append');
  return [...history, structuredClone(completion)];
}
