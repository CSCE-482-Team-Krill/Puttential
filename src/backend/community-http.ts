import { readCommunityJson, StrictJsonError } from '../shared/strict-json';
import { CompetitiveError, checkOrigin, currentGuest } from './competitive';
import { listCommunityMaps, publishCommunityMap, readCommunityMap } from './community-maps';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await readCommunityJson(request);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof StrictJsonError)
      throw new CompetitiveError(error.status, error.code, error.message);
    throw new CompetitiveError(400, 'INVALID_JSON', 'Invalid map JSON.');
  }
}

export async function communityHandler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (request.method === 'GET' && parts.length === 2)
      return Response.json(await listCommunityMaps(url.searchParams), { headers });
    if (request.method === 'GET' && parts.length === 3)
      return Response.json({ map: await readCommunityMap(parts[2]!) }, { headers });
    if (request.method === 'POST' && parts.length === 2) {
      checkOrigin(request);
      const guest = await currentGuest(request);
      const input = await readBody(request);
      if (input.expectedGuestId !== guest.id)
        throw new CompetitiveError(409, 'GUEST_CHANGED', 'Refresh to confirm your guest session.');
      return Response.json(await publishCommunityMap(guest, input), { status: 201, headers });
    }
    throw new CompetitiveError(404, 'NOT_FOUND', 'Community endpoint not found.');
  } catch (error) {
    const known = error instanceof CompetitiveError;
    if (!known)
      console.error('Community API unavailable', {
        type: error instanceof Error ? error.name : 'UnknownError',
      });
    return Response.json(
      {
        error: known ? error.message : 'Community is temporarily unavailable. Please retry.',
        code: known ? error.code : 'SERVICE_UNAVAILABLE',
        retryable: !known || error.status === 429,
      },
      { status: known ? error.status : 503, headers },
    );
  }
}
