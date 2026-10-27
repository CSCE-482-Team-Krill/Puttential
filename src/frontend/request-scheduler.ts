export type Priority = 'receipt' | 'foreground' | 'background';
type Job<T = any> = {
  priority: Priority;
  runKey?: string;
  completion?: boolean;
  readyAt?: number;
  signal?: AbortSignal;
  work: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};
/** Per-document budget, including bootstrap, reads, start, polls and completion. */
export class RequestScheduler {
  private jobs: Job[] = [];
  private active = 0;
  private completing = false;
  private runs = new Set<string>();
  private foregroundStreak = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private now = () => Date.now()) {}
  dispatch<T>(options: Omit<Job<T>, 'resolve' | 'reject'>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.jobs.push({ ...options, resolve, reject });
      options.signal?.addEventListener('abort', () => this.pump(), { once: true });
      this.pump();
    });
  }
  private pump() {
    clearTimeout(this.timer);
    for (const job of this.jobs.filter((j) => j.signal?.aborted)) {
      this.jobs.splice(this.jobs.indexOf(job), 1);
      job.reject(new DOMException('Request canceled', 'AbortError'));
    }
    while (this.active < 2) {
      const ready = this.jobs.filter(
        (j) =>
          (j.readyAt ?? 0) <= this.now() &&
          !(j.completion && this.completing) &&
          !(j.runKey && this.runs.has(j.runKey)),
      );
      const receipt = ready.find((j) => j.priority === 'receipt');
      const background = ready.find((j) => j.priority === 'background');
      const next =
        receipt ??
        (this.foregroundStreak >= 2 ? background : undefined) ??
        ready.find((j) => j.priority === 'foreground') ??
        background;
      if (!next) break;
      this.jobs.splice(this.jobs.indexOf(next), 1);
      this.active++;
      if (next.completion) this.completing = true;
      if (next.runKey) this.runs.add(next.runKey);
      if (next.priority === 'background') this.foregroundStreak = 0;
      else if (next.priority === 'foreground') this.foregroundStreak++;
      void Promise.resolve()
        .then(next.work)
        .then(next.resolve, next.reject)
        .finally(() => {
          this.active--;
          if (next.completion) this.completing = false;
          if (next.runKey) this.runs.delete(next.runKey);
          this.pump();
        });
    }
    const future = this.jobs.map((j) => j.readyAt ?? 0).filter((t) => t > this.now());
    if (future.length) this.timer = setTimeout(() => this.pump(), Math.min(...future) - this.now());
  }
}
