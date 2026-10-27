import type { PuzzleAvailability, PuzzleProgress, RunResponse } from '../shared/puzzle-contracts';

function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const identical = (a: unknown, b: unknown) => stable(a) === stable(b);
function merge<T>(
  map: Map<string, T>,
  key: string,
  next: T,
  revision: (v: T) => string,
  content = (v: T): unknown => v,
) {
  const current = map.get(key);
  if (current) {
    if (BigInt(revision(current)) > BigInt(revision(next))) return current;
    if (revision(current) === revision(next)) {
      if (!identical(content(current), content(next)))
        throw new Error('Conflicting data at the same revision. Refresh required.');
      return current;
    }
  }
  map.set(key, next);
  return next;
}
export class AuthoritativeState {
  readonly progress = new Map<string, PuzzleProgress>();
  readonly availability = new Map<string, PuzzleAvailability>();
  readonly runs = new Map<string, RunResponse>();
  applyProgress(p: PuzzleProgress) {
    return merge(this.progress, `${p.guestId}/${p.puzzleId}`, p, (v) => v.revision);
  }
  applyAvailability(a: PuzzleAvailability) {
    return merge(this.availability, a.puzzleId, a, (v) => v.revision);
  }
  applyRun(r: RunResponse) {
    const progress = this.applyProgress(r.progress);
    const availability = this.applyAvailability(r.availability);
    const key = `${r.guestId}/${r.runId}`;
    const lifecycle = merge(
      this.runs,
      key,
      r,
      (v) => v.runRevision,
      ({ progress: _p, availability: _a, ...lifecycle }) => lifecycle,
    );
    const current = { ...lifecycle, progress, availability };
    this.runs.set(key, current);
    return current;
  }
}
