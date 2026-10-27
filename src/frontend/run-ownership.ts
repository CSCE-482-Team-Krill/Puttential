export type Ownership =
  { status: 'owned'; release: () => void } | { status: 'owned-elsewhere' | 'unavailable' };

/** No timeout is a lease. A stalled or busy API never permits stealing an observed run. */
export async function acquireExecution(
  requestId: string,
  locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks,
): Promise<Ownership> {
  if (!locks) return { status: 'unavailable' };
  return new Promise((resolve) => {
    let valid = true;
    const finish = (value: Ownership) => {
      if (valid) {
        valid = false;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => finish({ status: 'unavailable' }), 1000);
    void locks
      .request(`puttential-run-${requestId}`, { ifAvailable: true }, async (lock) => {
        if (!valid) return;
        if (!lock) {
          finish({ status: 'owned-elsewhere' });
          return;
        }
        await new Promise<void>((release) => finish({ status: 'owned', release }));
      })
      .catch(() => finish({ status: 'unavailable' }));
  });
}

export function ownerTokens() {
  let tab = crypto.randomUUID();
  try {
    tab = sessionStorage.getItem('puttential-tab') ?? tab;
    sessionStorage.setItem('puttential-tab', tab);
  } catch {
    /* Fresh document identity still prevents accidental ownership inference. */
  }
  return { tab, document: crypto.randomUUID() };
}
