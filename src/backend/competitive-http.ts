import { LIMITS } from '../shared/puzzle-contracts';
import { centralDateString } from './puzzle-date';

async function body(request: Request) {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json'))
    throw Object.assign(new Error('Send a JSON body.'), { status: 415, code: 'JSON_REQUIRED' });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > LIMITS.bodyBytes) {
          await reader.cancel();
          throw Object.assign(new Error('Request is too large.'), {
            status: 413,
            code: 'BODY_TOO_LARGE',
          });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error('Invalid JSON object.'), { status: 400, code: 'INVALID_JSON' });
  }
}
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Origin',
  'X-Content-Type-Options': 'nosniff',
};
export async function competitiveHandler(request: Request): Promise<Response> {
  try {
    const api = await import('./competitive');
    const url = new URL(request.url),
      path = url.pathname
        .replace(/^\/api\//, '')
        .split('/')
        .map(decodeURIComponent);
    if (request.method === 'GET' && path.join('/') === 'puzzles/today')
      return Response.json(await api.datedPuzzle(centralDateString()), { headers });
    if (
      request.method === 'GET' &&
      path[0] === 'puzzles' &&
      path[1] === 'by-date' &&
      path.length === 3
    )
      return Response.json(await api.datedPuzzle(path[2]!), { headers });
    if (request.method === 'POST' && path.join('/') === 'guest') {
      api.checkOrigin(request);
      await body(request);
      const result = await api.createGuest(request);
      return Response.json(
        { player: result.player },
        { headers: { ...headers, ...(result.cookie ? { 'Set-Cookie': result.cookie } : {}) } },
      );
    }
    const write = ['POST', 'PATCH'].includes(request.method);
    if (write) api.checkOrigin(request);
    const input = write ? await body(request) : undefined;
    const guest = await api.currentGuest(request, write ? input?.expectedGuestId : undefined);
    if (write && input?.expectedGuestId !== guest.id)
      throw new api.CompetitiveError(
        409,
        'GUEST_CHANGED',
        'Refresh to confirm your guest session.',
      );
    let result: unknown;
    if (path.join('/') === 'me' && request.method === 'GET')
      result = { player: { id: guest.id, nickname: guest.nickname } };
    else if (path.join('/') === 'me' && request.method === 'PATCH')
      result = await api.renameGuest(request, input);
    else if (path.join('/') === 'me/progress' && request.method === 'GET')
      result = await api.readProgress(guest, url.searchParams.get('puzzleId') ?? '');
    else if (path.join('/') === 'runs' && request.method === 'POST') {
      if (typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId))
        throw new api.CompetitiveError(400, 'INVALID_SETUP', 'A valid request ID is required.');
      result = await api.startRun(guest, input);
    } else if (
      path[0] === 'runs' &&
      path[1] === 'by-request' &&
      path.length === 3 &&
      request.method === 'GET'
    )
      result = await api.readRun(guest, path[2]!, true);
    else if (path[0] === 'runs' && path.length === 2 && request.method === 'GET')
      result = await api.readRun(guest, path[1]!);
    else if (
      path[0] === 'runs' &&
      path[2] === 'complete' &&
      path.length === 3 &&
      request.method === 'POST'
    )
      result = await api.completeRun(guest, path[1]!, input);
    else if (path.join('/') === 'puzzles' && request.method === 'GET')
      result = await api.archive(guest, url.searchParams);
    else if (
      path[0] === 'puzzles' &&
      path[2] === 'leaderboard' &&
      path.length === 3 &&
      request.method === 'GET'
    )
      result = await api.leaderboard(guest, path[1]!, url.searchParams);
    else throw new api.CompetitiveError(404, 'NOT_FOUND', 'API endpoint not found.');
    return Response.json(result, { headers });
  } catch (error: any) {
    const known = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;
    if (!known)
      console.error('Competitive API unavailable', { type: error?.name ?? 'UnknownError' });
    const status = known ? error.status : 503;
    return Response.json(
      {
        error: known
          ? error.message
          : 'The puzzle service is unavailable. Your saved progress is safe. Please retry.',
        code: known ? error.code : 'SERVICE_UNAVAILABLE',
        retryable: status >= 500 || status === 429,
      },
      {
        status,
        headers: { ...headers, ...([429, 503].includes(status) ? { 'Retry-After': '5' } : {}) },
      },
    );
  }
}
