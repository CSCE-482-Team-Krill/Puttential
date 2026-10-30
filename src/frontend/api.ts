import type {
  BoardView,
  CompleteRunRequest,
  Scope,
  StartRunRequest,
} from '../shared/puzzle-contracts';
import { LIMITS } from '../shared/puzzle-contracts';
import {
  decodeArchive,
  decodeBoard,
  decodePlayer,
  decodeProgress,
  decodePuzzle,
  decodeRun,
  decodeReplay,
  validDate,
} from './response-validation';
import { RequestScheduler } from './request-scheduler';
import type { Priority } from './request-scheduler';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  priority?: Priority;
  runKey?: string;
  readyAt?: number;
};
export class PuzzleApi {
  constructor(
    readonly scheduler = new RequestScheduler(),
    private transport: typeof fetch = (...args) => fetch(...args),
  ) {}
  private request<T>(
    path: string,
    decode: (value: unknown) => T,
    options: RequestOptions = {},
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    if (encoded && new TextEncoder().encode(encoded).length > LIMITS.bodyBytes)
      return Promise.reject(new ApiError('Request is too large.', 413, 'BODY_TOO_LARGE', false));
    const operation = new AbortController();
    const cancelOperation = () => operation.abort();
    options.signal?.addEventListener('abort', cancelOperation, { once: true });
    if (options.signal?.aborted) operation.abort();
    const operationDeadline = setTimeout(
      cancelOperation,
      Math.min(options.timeoutMs ?? 10_000, 10_000),
    );
    const callerSignal = options.signal;
    options = { ...options, signal: operation.signal };
    const expiredOperation = new Promise<never>((_, reject) => {
      const rejectUnknown = () =>
        reject(
          new ApiError(
            'The request timed out or was canceled. Retry to check its status.',
            0,
            'REQUEST_UNKNOWN',
            true,
          ),
        );
      if (operation.signal.aborted) rejectUnknown();
      else operation.signal.addEventListener('abort', rejectUnknown, { once: true });
    });
    const dispatched = this.scheduler.dispatch({
      priority: options.priority ?? 'foreground',
      ...(options.runKey ? { runKey: options.runKey } : {}),
      ...(options.readyAt ? { readyAt: options.readyAt } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      completion: method === 'POST' && path.endsWith('/complete'),
      work: async () => {
        if (operation.signal.aborted)
          throw new ApiError('Request canceled.', 0, 'REQUEST_UNKNOWN', true);
        return Promise.race([
          expiredOperation,
          (async () => {
            const response = await this.transport(path, {
              method,
              credentials: 'same-origin',
              cache: 'no-store',
              signal: operation.signal,
              ...(encoded === undefined
                ? {}
                : { headers: { 'Content-Type': 'application/json' }, body: encoded }),
            });
            const value: any = await response.json().catch(() => null);
            if (!response.ok) {
              const after = response.headers.get('Retry-After');
              const ms =
                after === null
                  ? 0
                  : /^\d+(\.\d+)?$/.test(after)
                    ? Number(after) * 1000
                    : Math.max(0, Date.parse(after) - Date.now());
              throw new ApiError(
                typeof value?.error === 'string'
                  ? value.error
                  : 'The puzzle service is unavailable.',
                response.status,
                typeof value?.code === 'string' ? value.code : 'SERVICE_UNAVAILABLE',
                value?.retryable === true || response.status >= 500 || response.status === 429,
                Number.isFinite(ms) ? ms : 0,
              );
            }
            try {
              return decode(value);
            } catch {
              throw new ApiError(
                'The puzzle service returned incompatible data.',
                response.status,
                'INVALID_DATA',
                false,
              );
            }
          })(),
        ]);
      },
    });
    return Promise.race([dispatched, expiredOperation]).finally(() => {
      clearTimeout(operationDeadline);
      callerSignal?.removeEventListener('abort', cancelOperation);
    });
  }
  me = (o?: RequestOptions) => this.request('/api/me', decodePlayer, o);
  guest = (o?: RequestOptions) => this.request('/api/guest', decodePlayer, o, 'POST', {});
  nickname = (expectedGuestId: string, nickname: string, o?: RequestOptions) =>
    this.request('/api/me', decodePlayer, o, 'PATCH', { expectedGuestId, nickname });
  today = (o?: RequestOptions) => this.request('/api/puzzles/today', decodePuzzle, o);
  byDate = (date: string, o?: RequestOptions) =>
    validDate(date)
      ? this.request(`/api/puzzles/by-date/${date}`, decodePuzzle, o)
      : Promise.reject(new ApiError('Use a valid course date.', 400, 'INVALID_DATE', false));
  progress = (puzzleId: string, o?: RequestOptions) =>
    this.request(`/api/me/progress?puzzleId=${encodeURIComponent(puzzleId)}`, decodeProgress, o);
  start = (body: StartRunRequest, o?: RequestOptions) =>
    this.request('/api/runs', decodeRun, { ...o, runKey: body.requestId }, 'POST', body);
  byRequest = (id: string, o?: RequestOptions) =>
    this.request(`/api/runs/by-request/${encodeURIComponent(id)}`, decodeRun, { ...o, runKey: id });
  run = (id: string, o?: RequestOptions) =>
    this.request(`/api/runs/${encodeURIComponent(id)}`, decodeRun, o);
  complete = (id: string, body: CompleteRunRequest, o?: RequestOptions) =>
    this.request(`/api/runs/${encodeURIComponent(id)}/complete`, decodeRun, o, 'POST', body);
  archive = (month = '', cursor: string | null = null, o?: RequestOptions) =>
    this.request(
      `/api/puzzles?${new URLSearchParams({ ...(month ? { month } : {}), ...(cursor ? { cursor } : {}), limit: '20' })}`,
      decodeArchive,
      o,
    );
  board = (
    id: string,
    scope: Scope,
    view: BoardView,
    cursor: string | null = null,
    o?: RequestOptions,
  ) =>
    this.request(
      `/api/puzzles/${encodeURIComponent(id)}/leaderboard?${new URLSearchParams({ scope, view, limit: '20', ...(cursor ? { cursor } : {}) })}`,
      decodeBoard,
      o,
    );
  replay = (id: string, playerId: string, scope: Scope, o?: RequestOptions) =>
    this.request(
      `/api/puzzles/${encodeURIComponent(id)}/replays/${encodeURIComponent(playerId)}?${new URLSearchParams({ scope })}`,
      decodeReplay,
      { priority: 'foreground', ...o },
    );
}
export const puzzleApi = new PuzzleApi();
