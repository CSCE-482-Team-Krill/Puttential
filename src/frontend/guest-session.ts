import { ApiError, puzzleApi } from './api';
import type { PuzzleApi } from './api';
import type { Player } from '../shared/puzzle-contracts';

/** A POST response alone never establishes identity: confirm the cookie with GET me. */
export async function bootstrapGuest(
  api: PuzzleApi = puzzleApi,
  signal?: AbortSignal,
): Promise<Player> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, 25_000);
  let live = true;
  const ensureLive = () => {
    if (!live || controller.signal.aborted)
      throw new Error('Competitive session unavailable. Retry or play practice.');
  };
  const flow = async () => {
    ensureLive();
    let player: Player | undefined;
    try {
      player = (await api.me({ signal: controller.signal })).player;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      ensureLive();
      await api.guest({ signal: controller.signal });
    }
    ensureLive();
    const confirmed = (await api.me({ signal: controller.signal })).player;
    if (!live || controller.signal.aborted)
      throw new Error('Competitive session unavailable. Retry or play practice.');
    if (player && player.id !== confirmed.id)
      throw new Error('Guest session changed. Retry to confirm it.');
    return confirmed;
  };
  try {
    const expired = new Promise<never>((_, reject) =>
      controller.signal.addEventListener(
        'abort',
        () => reject(new Error('Competitive session unavailable. Retry or play practice.')),
        { once: true },
      ),
    );
    if (signal?.aborted) {
      controller.abort();
      throw new Error('Session loading canceled.');
    }
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    const lockedFlow = async () => {
      if (!locks) return flow();
      const waiting = new AbortController();
      let acquired = false;
      let rejectWait!: (error: Error) => void;
      const waitDeadline = new Promise<never>((_, reject) => {
        rejectWait = reject;
      });
      const timer = setTimeout(() => {
        waiting.abort();
        rejectWait(new Error('Guest bootstrap lock is busy.'));
      }, 2000);
      const cancelWait = () => waiting.abort();
      controller.signal.addEventListener('abort', cancelWait, { once: true });
      try {
        return await Promise.race([
          waitDeadline,
          locks.request('puttential-guest-bootstrap', { signal: waiting.signal }, async () => {
            acquired = true;
            clearTimeout(timer);
            if (waiting.signal.aborted || !live) throw new Error('Session loading canceled.');
            return flow();
          }),
        ]);
      } catch (e) {
        if (acquired || controller.signal.aborted) throw e;
        return flow();
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', cancelWait);
      }
    };
    return await Promise.race([lockedFlow(), expired]);
  } finally {
    live = false;
    clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
  }
}
