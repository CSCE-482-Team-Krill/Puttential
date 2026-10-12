import { NextRequest, NextResponse } from 'next/server';
import { LibraryError, listLevels, loadLevel, saveLevel } from '../../../editor/library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function checkLocal(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
    throw new LibraryError('The editor library is local only', 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== `http://${host}`)
    throw new LibraryError('Cross-origin library requests are not allowed', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new LibraryError('Cross-site library requests are not allowed', 403);
}
function failure(cause: unknown) {
  return NextResponse.json(
    { error: cause instanceof Error ? cause.message : 'Library request failed' },
    { status: cause instanceof LibraryError ? cause.status : 400 },
  );
}
export async function GET(request: NextRequest) {
  try {
    checkLocal(request);
    const id = request.nextUrl.searchParams.get('id');
    return NextResponse.json(id ? await loadLevel(id) : { levels: await listLevels() });
  } catch (cause) {
    return failure(cause);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkLocal(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new LibraryError('Expected JSON');
    // Bound streamed input too; Content-Length alone is not a reliable limit.
    const reader = request.body?.getReader();
    if (!reader) throw new LibraryError('Missing document');
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2_000_000) {
        await reader.cancel();
        throw new LibraryError('Document is too large', 413);
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body.revision !== null && typeof body.revision !== 'string')
      throw new LibraryError('Missing save revision');
    return NextResponse.json(await saveLevel(body.document, body.revision));
  } catch (cause) {
    return failure(cause);
  }
}
