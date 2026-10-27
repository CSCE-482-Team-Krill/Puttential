import type {
  CompleteRunRequest,
  PuzzleResponse,
  RunResponse,
  StartRunRequest,
} from '../shared/puzzle-contracts';
import type { Draft } from './puzzle';
import { identical } from './authoritative-state';

export type RecoveryRecord = {
  version: 1;
  persistence: 'durable' | 'memory';
  start: StartRunRequest;
  context: PuzzleResponse;
  owner: { tab: string; document: string };
  phase: 'starting' | 'accepted' | 'pending' | 'terminal';
  cancelRequested: boolean;
  response?: RunResponse;
  intent?: CompleteRunRequest;
  failures: number;
  retryAt: number;
  message: string;
};
const recordKey = (r: RecoveryRecord) => `${r.start.expectedGuestId}/${r.start.requestId}`;
const clone = <T>(v: T): T => structuredClone(v);
function validTransition(old: RecoveryRecord | undefined, next: RecoveryRecord) {
  if (!old) return;
  if (
    !identical(old.start, next.start) ||
    !identical(old.context, next.context) ||
    old.persistence !== next.persistence ||
    !identical(old.owner, next.owner)
  )
    throw new Error('Immutable run context changed.');
  if (old.intent && !identical(old.intent, next.intent))
    throw new Error('Completion intent is immutable.');
  if (old.cancelRequested && !next.cancelRequested)
    throw new Error('Cancellation cannot be reversed.');
  const order = { starting: 0, accepted: 1, pending: 2, terminal: 3 };
  if (order[next.phase] < order[old.phase]) throw new Error('Recovery state cannot move backward.');
}

export class ProgressStorage {
  mode: 'initializing' | 'durable' | 'memory' = 'initializing';
  private db: IDBDatabase | undefined;
  private generation = 0;
  private records = new Map<string, RecoveryRecord>();
  private drafts = new Map<string, Draft>();
  private pending = Promise.resolve();
  async initialize(
    factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
  ) {
    const generation = ++this.generation;
    this.db?.close();
    this.db = undefined;
    if (!factory) {
      this.mode = 'memory';
      return;
    }
    await new Promise<void>((resolve) => {
      let finished = false;
      const fallback = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (this.generation === generation) this.mode = 'memory';
        resolve();
      };
      const timer = setTimeout(fallback, 3000);
      let request: IDBOpenDBRequest;
      try {
        request = factory.open('puttential-progress', 1);
      } catch {
        fallback();
        return;
      }
      request.onupgradeneeded = () => {
        if (finished || this.generation !== generation) {
          request.transaction?.abort();
          return;
        }
        if (!request.result.objectStoreNames.contains('runs'))
          request.result.createObjectStore('runs');
        if (!request.result.objectStoreNames.contains('drafts'))
          request.result.createObjectStore('drafts');
      };
      request.onblocked = fallback;
      request.onerror = fallback;
      request.onsuccess = () => {
        if (finished || this.generation !== generation) {
          request.result.close();
          return;
        }
        finished = true;
        clearTimeout(timer);
        this.db = request.result;
        this.mode = 'durable';
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = undefined;
          this.mode = 'memory';
          ++this.generation;
        };
        resolve();
      };
    });
  }
  private transaction<T>(
    store: string,
    mode: IDBTransactionMode,
    work: (s: IDBObjectStore, done: (value: T) => void) => void,
  ): Promise<T> {
    const db = this.db;
    if (!db || this.mode !== 'durable')
      return Promise.reject(new Error('Recovery storage unavailable.'));
    return new Promise((resolve, reject) => {
      let finished = false;
      let value: T;
      const tx = db.transaction(store, mode);
      const fail = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.mode = 'memory';
        this.db?.close();
        this.db = undefined;
        reject(new Error('Progress recovery unavailable after refresh.'));
      };
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {
          /* Unknown commit is reconciled under the same ID. */
        }
        fail();
      }, 2000);
      tx.onerror = fail;
      tx.onabort = fail;
      tx.oncomplete = () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve(value);
        }
      };
      try {
        work(tx.objectStore(store), (v) => {
          value = v;
        });
      } catch (e) {
        try {
          tx.abort();
        } catch {}
        fail();
      }
    });
  }
  async list(guestId: string): Promise<RecoveryRecord[]> {
    if (this.mode === 'durable') {
      try {
        const rows = await this.transaction<RecoveryRecord[]>('runs', 'readonly', (s, done) => {
          const req = s.getAll();
          req.onsuccess = () => done(req.result);
        });
        for (const row of rows)
          if (row.version === 1 && row.start.expectedGuestId === guestId) {
            const current = this.records.get(recordKey(row));
            if (
              !current ||
              (current.phase !== 'terminal' &&
                (row.phase === 'terminal' || (!current.intent && row.intent)))
            )
              this.records.set(recordKey(row), clone(row));
          }
      } catch {
        /* Retain the same in-memory identities. */
      }
    }
    return [...this.records.values()].filter((r) => r.start.expectedGuestId === guestId).map(clone);
  }
  async put(record: RecoveryRecord): Promise<void> {
    const next = clone(record);
    // Same-document updates are serialized, including memory fallback after a failed transaction.
    const operation = this.pending.then(async () => {
      const key = recordKey(next);
      validTransition(this.records.get(key), next);
      if (this.mode === 'durable' && next.persistence === 'durable') {
        let conflict: Error | undefined;
        try {
          await this.transaction<void>('runs', 'readwrite', (s, done) => {
            const req = s.get(key);
            req.onsuccess = () => {
              try {
                validTransition(req.result, next);
                s.put(next, key);
                done();
              } catch (e) {
                conflict = e instanceof Error ? e : new Error('Recovery conflict.');
                req.transaction?.abort();
              }
            };
          });
        } catch {
          if (conflict) throw conflict;
          // Preserve immutable operation in memory. Never generate a replacement request.
        }
      }
      this.records.set(key, next);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
  async saveDraft(key: string, draft: Draft) {
    this.drafts.set(key, clone(draft));
    if (this.mode === 'durable')
      try {
        await this.transaction<void>('drafts', 'readwrite', (s, done) => {
          s.put({ version: 1, draft }, key);
          done();
        });
      } catch {}
  }
  async loadDraft(key: string): Promise<Draft | undefined> {
    if (this.drafts.has(key)) return clone(this.drafts.get(key)!);
    if (this.mode === 'durable')
      try {
        const result = await this.transaction<{ version: number; draft: Draft } | undefined>(
          'drafts',
          'readonly',
          (s, done) => {
            const req = s.get(key);
            req.onsuccess = () => done(req.result);
          },
        );
        if (result?.version === 1) return result.draft;
      } catch {}
    return undefined;
  }
  close() {
    ++this.generation;
    this.db?.close();
    this.db = undefined;
  }
}
