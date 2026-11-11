import type { PublishCommunityMap } from '../shared/community-maps';
import {
  decodeCommunityList,
  decodeCommunityMap,
  decodeCommunityPublication,
} from '../shared/community-response-validation';

export class CommunityApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'CommunityApiError';
  }
}

async function request<T>(
  path: string,
  decode: (value: unknown) => T,
  options: RequestInit = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(65_000);
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    throw new CommunityApiError(
      typeof error.error === 'string' ? error.error : 'Community is unavailable. Please retry.',
      response.status,
      typeof error.code === 'string' ? error.code : 'SERVICE_UNAVAILABLE',
      error.retryable === true || response.status >= 500 || response.status === 429,
    );
  }
  try {
    return decode(body);
  } catch {
    throw new CommunityApiError(
      'Community returned invalid data. Please retry.',
      response.status,
      'INVALID_DATA',
      true,
    );
  }
}
export const communityApi = {
  list: (cursor?: string, signal?: AbortSignal) =>
    request(
      `/api/community${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      (value) => decodeCommunityList(value, cursor),
      { ...(signal ? { signal } : {}) },
    ),
  read: (id: string, signal?: AbortSignal) =>
    request(`/api/community/${encodeURIComponent(id)}`, (value) => decodeCommunityMap(value, id), {
      ...(signal ? { signal } : {}),
    }),
  publish: (input: PublishCommunityMap) =>
    request('/api/community', decodeCommunityPublication, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
};
