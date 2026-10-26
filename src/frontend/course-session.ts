import type { Placement, Player, PuzzleResponse, RunResponse } from '../shared/puzzle-contracts';
import { ApiError } from './api';
import type { PuzzleApi } from './api';
import { AuthoritativeState } from './authoritative-state';
import { acquireExecution } from './run-ownership';
import type { Ownership } from './run-ownership';
import type { ProgressStorage, RecoveryRecord } from './progress-storage';
import { runMessage, SubmissionQueue, terminal } from './submission-queue';
import { validateStart } from './response-validation';

export type SessionExecutor = {
  supports: (puzzle: PuzzleResponse) => boolean;
  play: (placement: Placement, requestId: string) => void;
};
/** Competitive wrapper owns all guest/API/recovery work. usePuzzle stays a local executor. */
export class CourseSession {
  readonly state = new AuthoritativeState();
  readonly queue: SubmissionQueue;
  readonly records = new Map<string, RecoveryRecord>();
  private leases = new Map<string, () => void>();
  private starting = new Set<string>();
  private live = new Set<string>();
  private disposed = false;
  private canceled = new Set<string>();
  private blockers = new Set<string>();
  constructor(
    private api: PuzzleApi,
    readonly storage: ProgressStorage,
    private owner: { tab: string; document: string },
    private executor: SessionExecutor,
    private changed: () => void,
    private reconcileGuest: () => void,
    private acquire: (id: string) => Promise<Ownership> = acquireExecution,
    private uuid = () => crypto.randomUUID(),
  ) {
    this.queue = new SubmissionQueue(
      api,
      storage,
      this.state,
      (r) => {
        this.records.set(r.start.requestId, r);
        this.changed();
      },
      reconcileGuest,
    );
  }
  private publish(record: RecoveryRecord) {
    this.records.set(record.start.requestId, record);
    this.changed();
  }
  private async confirm(guestId: string) {
    const current = (await this.api.me()).player;
    if (current.id !== guestId) {
      this.reconcileGuest();
      throw new ApiError('Guest session changed.', 409, 'GUEST_CHANGED', false);
    }
  }
  async start(puzzle: PuzzleResponse, player: Player, placement: Placement) {
    const key = `${player.id}/${puzzle.id}`;
    if (
      this.starting.has(key) ||
      [...this.records.values()].some(
        (r) =>
          r.start.expectedGuestId === player.id &&
          r.start.puzzleId === puzzle.id &&
          this.blocks(r) &&
          r.phase !== 'terminal' &&
          !r.intent,
      )
    )
      throw new Error('Resolve the current run before another Play.');
    if (
      !this.executor.supports(puzzle) ||
      puzzle.availability.publicationStatus !== 'active' ||
      puzzle.date > puzzle.todayDate
    )
      throw new Error('Unavailable in this version.');
    this.starting.add(key);
    try {
      const requestId = this.uuid();
      const record: RecoveryRecord = {
        version: 1,
        persistence: this.storage.mode === 'durable' ? 'durable' : 'memory',
        start: structuredClone({
          expectedGuestId: player.id,
          requestId,
          puzzleId: puzzle.id,
          placement,
        }),
        context: structuredClone(puzzle),
        owner: this.owner,
        phase: 'starting',
        cancelRequested: false,
        failures: 0,
        retryAt: 0,
        message: 'Starting run…',
      };
      validateStart(record.start, puzzle);
      this.publish(record);
      this.blockers.add(requestId);
      const ownership = await this.acquire(requestId);
      if (ownership.status === 'owned-elsewhere') {
        this.records.delete(requestId);
        throw new Error('This run is open in another tab.');
      }
      if (ownership.status === 'owned') this.leases.set(requestId, ownership.release);
      await this.storage.put(record);
      await this.acknowledge(record, true);
      return record;
    } finally {
      this.starting.delete(key);
    }
  }
  private async acknowledge(record: RecoveryRecord, mayPlay: boolean) {
    try {
      await this.confirm(record.start.expectedGuestId);
      let response: RunResponse;
      if (mayPlay) response = await this.api.start(record.start);
      else {
        try {
          response = await this.api.byRequest(record.start.requestId);
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 404) throw e;
          response = await this.api.start(record.start); // Same immutable payload; 404 does not settle ambiguity.
        }
      }
      await this.accept(record, response, mayPlay);
    } catch (e) {
      record.message = e instanceof Error ? e.message : 'Start status unknown. Retry this run.';
      if (e instanceof ApiError && (e.status === 401 || e.code === 'GUEST_CHANGED'))
        this.reconcileGuest();
      // Only a definitive new-start validation rejection settles a request. Transport/404 ambiguity keeps it frozen.
      if (
        e instanceof ApiError &&
        ([400, 403, 410, 413, 422].includes(e.status) ||
          ['VERSION_UNSUPPORTED', 'PUZZLE_CANCELED'].includes(e.code))
      ) {
        record.phase = 'terminal';
        this.release(record);
      }
      await this.storage.put(record);
      this.publish(record);
    }
  }
  private async accept(record: RecoveryRecord, response: RunResponse, mayPlay: boolean) {
    if (
      response.guestId !== record.start.expectedGuestId ||
      response.requestId !== record.start.requestId ||
      response.puzzleId !== record.start.puzzleId
    )
      throw new Error('Run identity mismatch. Refresh required.');
    this.state.applyRun(response);
    record.response = this.state.runs.get(`${response.guestId}/${response.runId}`)!;
    if (terminal(record.response)) {
      record.phase = 'terminal';
      record.message = runMessage(record.response);
      await this.storage.put(record);
      this.publish(record);
      this.release(record);
      return;
    }
    if (record.response.state === 'processing') {
      record.intent = record.response.completion.intent;
      record.phase = 'pending';
      record.message = runMessage(record.response);
      await this.storage.put(record);
      this.publish(record);
      this.release(record);
      void this.queue.enqueue(record);
      return;
    }
    record.phase = record.intent ? 'pending' : 'accepted';
    record.message = 'Run accepted.';
    await this.storage.put(record);
    this.publish(record);
    if (record.intent) {
      this.release(record);
      void this.queue.enqueue(record);
    } else if (record.cancelRequested || this.canceled.has(record.start.requestId))
      await this.finish(record.start.requestId, 'aborted', 0);
    else if (mayPlay && !this.disposed) {
      // Persistence acknowledgement precedes the only playback launch.
      this.live.add(record.start.requestId);
      this.executor.play(record.start.placement, record.start.requestId);
    } else {
      record.message =
        'Accepted run needs recovery. Close its original execution before recovering.';
      this.publish(record);
    }
  }
  async finish(id: string, kind: 'terminal' | 'aborted' | 'interrupted', observedTick: number) {
    const record = this.records.get(id);
    if (!record || record.phase === 'terminal' || record.intent) return;
    if (!record.response) {
      await this.cancel(id);
      return;
    }
    record.intent =
      kind === 'terminal'
        ? { expectedGuestId: record.start.expectedGuestId, kind }
        : {
            expectedGuestId: record.start.expectedGuestId,
            kind,
            observedTick: Math.max(
              0,
              Math.min(record.context.rules.maxTicks, Math.trunc(observedTick)),
            ),
          };
    record.phase = 'pending';
    record.message = 'Saving unverified result…';
    await this.storage.put(record);
    this.publish(record);
    this.release(record);
    // Priority stays with this intent across panel close/course switch, until first send.
    void this.queue.enqueue(record, kind === 'terminal' && this.live.has(id));
    this.live.delete(id);
  }
  async cancel(id: string) {
    this.canceled.add(id);
    const record = this.records.get(id);
    if (!record || record.intent || record.phase === 'terminal') return;
    record.cancelRequested = true;
    await this.storage.put(record);
    this.publish(record);
    if (record.response?.state === 'accepted') await this.finish(id, 'aborted', 0);
  }
  async recover(guestId: string) {
    this.queue.resume(guestId);
    for (const record of await this.storage.list(guestId)) {
      if (this.disposed) return;
      this.publish(record);
      // Observing an accepted/starting record never infers interruption in any tab.
      if (record.phase !== 'terminal') {
        if (record.intent || record.cancelRequested) await this.acknowledge(record, false);
        else {
          try {
            const response = await this.api.byRequest(record.start.requestId, {
              priority: 'background',
            });
            await this.accept(record, response, false);
          } catch {
            record.message =
              'Run status unknown. Return to the original execution or retry recovery.';
            this.publish(record);
          }
        }
        if (
          !record.intent &&
          record.owner.tab === this.owner.tab &&
          record.owner.document !== this.owner.document
        ) {
          const ownership = await this.acquire(record.start.requestId);
          if (ownership.status === 'owned') ownership.release();
          if (ownership.status !== 'owned-elsewhere') this.blockers.add(record.start.requestId);
        }
      }
    }
  }
  async retry(id: string) {
    const record = this.records.get(id);
    if (!record || record.phase === 'terminal') return;
    await this.confirm(record.start.expectedGuestId);
    if (record.intent && record.response) await this.queue.enqueue(record, false, true);
    else await this.acknowledge(record, false);
  }
  async interrupt(id: string) {
    const record = this.records.get(id);
    if (!record || record.intent || record.phase === 'terminal') return;
    const ownership = await this.acquire(id);
    if (ownership.status !== 'owned')
      throw new Error(
        ownership.status === 'owned-elsewhere'
          ? 'This run is open in another tab. Return there or close it first.'
          : 'Automatic recovery is unavailable. End the original execution before trying again in a browser with run coordination.',
      );
    this.leases.set(id, ownership.release);
    try {
      // Re-read inside the lock; a stored completion always wins.
      const latest =
        (await this.storage.list(record.start.expectedGuestId)).find(
          (r) => r.start.requestId === id,
        ) ?? record;
      this.publish(latest);
      await this.acknowledge(latest, false);
      if (!latest.intent && latest.response?.state === 'accepted')
        await this.finish(id, 'interrupted', 0);
    } finally {
      this.release(record);
    }
  }
  private release(record: RecoveryRecord) {
    this.leases.get(record.start.requestId)?.();
    this.leases.delete(record.start.requestId);
  }
  blocks(record: RecoveryRecord) {
    return (
      this.blockers.has(record.start.requestId) || record.owner.document === this.owner.document
    );
  }
  dispose() {
    this.disposed = true;
    this.queue.dispose();
    for (const release of this.leases.values()) release();
    this.leases.clear();
  }
}
