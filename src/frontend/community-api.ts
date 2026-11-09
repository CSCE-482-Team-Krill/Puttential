import type {
  CommunityMapDetail,
  CommunityMapList,
  CommunityMapSummary,
  PublishCommunityMap,
} from '../shared/community-maps';
import { parseLevel } from '../game/levels/parse';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(65_000);
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'Community is unavailable. Please retry.',
    );
  return body as T;
}
export const communityApi = {
  list: (cursor?: string, signal?: AbortSignal) =>
    request<CommunityMapList>(
      `/api/community${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      { ...(signal ? { signal } : {}) },
    ),
  async read(id: string, signal?: AbortSignal): Promise<CommunityMapDetail> {
    const { map } = await request<{ map: CommunityMapDetail }>(
      `/api/community/${encodeURIComponent(id)}`,
      { ...(signal ? { signal } : {}) },
    );
    return { ...map, configuration: parseLevel(map.configuration) };
  },
  publish: (input: PublishCommunityMap) =>
    request<{ map: CommunityMapSummary }>('/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
};
