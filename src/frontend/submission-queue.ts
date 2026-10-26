import { ApiError } from './api';
import type { PuzzleApi } from './api';
import type { RecoveryRecord, ProgressStorage } from './progress-storage';
import type { RunResponse } from '../shared/puzzle-contracts';
import type { AuthoritativeState } from './authoritative-state';
import { identical } from './authoritative-state';

export const retryDelay = (failures: number) =>
  [1000, 2000, 4000, 8000, 16000, 30000][Math.min(5, Math.max(0, failures - 1))]!;
export const terminal = (r: RunResponse) => ['saved', 'rejected', 'canceled'].includes(r.state);
export function runMessage(r: RunResponse): string {
  if (r.availability.publicationStatus === 'canceled')
    return `Course canceled. ${r.availability.cancellationMessage}`;
  if (r.state === 'saved')
    return r.result.verification === 'not-applicable'
      ? 'Stopped run saved.'
      : r.result.dailyEligible
        ? 'Saved and verified.'
        : 'Saved and verified outside daily window.';
  if (r.state === 'rejected') return `Invalid replay: ${r.rejection.message}`;
  if (r.state === 'processing')
    return r.verification.status === 'blocked' || r.verification.status === 'retry-wait'
      ? 'Verification delayed. Your result is retained.'
      : 'Verification pending.';
  if (r.state === 'canceled') return 'Course canceled.';
  return 'Run accepted.';
}
export class SubmissionQueue {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private active = new Map<string, Promise<void>>();
  private disposed = false;
  private paused = false;
  private guestId: string | undefined;
  constructor(
    private api: PuzzleApi,
    private storage: ProgressStorage,
    private state: AuthoritativeState,
    private changed: (r: RecoveryRecord) => void,
    private identityChanged: () => void,
  ) {}
  enqueue(record: RecoveryRecord, receiptCritical = false, manual = false): Promise<void> {
    if (this.disposed || !record.intent || !record.response || record.phase === 'terminal')
      return Promise.resolve();
    if (this.paused || (this.guestId && this.guestId !== record.start.expectedGuestId))
      return Promise.resolve();
    if (manual) record.failures = 0;
    if (record.retryAt > Date.now()) {
      record.message = 'Waiting before retrying this save.';
      this.changed(record);
      this.schedule(record, record.retryAt - Date.now());
      return Promise.resolve();
    }
    const key = record.start.requestId;
    if (this.active.has(key)) return this.active.get(key)!;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    const task = this.send(record, receiptCritical, manual).finally(() => this.active.delete(key));
    this.active.set(key, task);
    return task;
  }
  private schedule(record: RecoveryRecord, delay: number) {
    if (this.disposed) return;
    this.timers.set(
      record.start.requestId,
      setTimeout(() => {
        if (
          record.response?.state === 'processing' &&
          record.response.verification.status === 'blocked' &&
          typeof document !== 'undefined' &&
          document.hidden
        ) {
          this.schedule(record, 30_000);
          return;
        }
        void this.enqueue(record);
      }, delay),
    );
  }
  private async send(record: RecoveryRecord, receipt: boolean, manual: boolean) {
    if (manual) record.failures = 0;
    try {
      const opts = {
        priority: receipt
          ? ('receipt' as const)
          : manual
            ? ('foreground' as const)
            : ('background' as const),
        runKey: record.start.requestId,
        readyAt: record.retryAt,
      };
      const response =
        record.response!.state === 'processing'
          ? await this.api.run(record.response!.runId, opts)
          : await this.api.complete(record.response!.runId, record.intent!, opts);
      if (
        response.guestId !== record.start.expectedGuestId ||
        response.requestId !== record.start.requestId ||
        response.puzzleId !== record.start.puzzleId
      )
        throw new ApiError('Run identity changed. Refresh required.', 409, 'GUEST_CHANGED', false);
      this.state.applyRun(response);
      // An older lifecycle cannot reopen a terminal run, even with newer progress.
      record.response = this.state.runs.get(`${response.guestId}/${response.runId}`)!;
      if (
        record.response.state !== 'accepted' &&
        record.response.state !== 'canceled' &&
        !identical(record.intent, record.response.completion.intent)
      ) {
        record.message = 'The saved run has a different completion. Refresh to reconcile.';
        await this.storage.put(record);
        this.changed(record);
        return;
      }
      record.failures = 0;
      record.message = runMessage(record.response);
      if (terminal(record.response)) record.phase = 'terminal';
      await this.storage.put(record);
      this.changed(record);
      if (record.response.state === 'processing') {
        const delay = Math.max(
          record.response.verification.status === 'blocked' ? 30_000 : 1000,
          record.response.retryAfterMs || 2000,
        );
        this.schedule(record, delay);
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.code === 'GUEST_CHANGED')) {
        this.paused = true;
        this.identityChanged();
        record.message = 'Guest session changed. Saving paused.';
      } else if (e instanceof ApiError && e.code === 'COMPLETION_CONFLICT') {
        try {
          const current = await this.api.run(record.response!.runId, {
            priority: 'foreground',
            runKey: record.start.requestId,
          });
          this.state.applyRun(current);
          record.response = current;
          record.message =
            'Completion conflict. The server record is retained; refresh to reconcile.';
          if (terminal(current)) record.phase = 'terminal';
        } catch {
          record.message = 'Completion conflict. Retry to check the saved run.';
        }
      } else {
        record.failures++;
        record.message =
          e instanceof ApiError && !e.retryable
            ? 'Save needs reconciliation. Retry to check this run.'
            : 'Retry save. Your unverified result is retained.';
        if (!(e instanceof ApiError) || e.retryable) {
          record.retryAt =
            Date.now() +
            Math.max(retryDelay(record.failures), e instanceof ApiError ? e.retryAfterMs : 0);
          if (record.failures < 6) this.schedule(record, record.retryAt - Date.now());
        }
      }
      await this.storage.put(record);
      this.changed(record);
    }
  }
  dispose() {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
  }
  resume(guestId: string) {
    this.guestId = guestId;
    this.paused = false;
  }
}
