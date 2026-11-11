import { createScanner, visit } from 'jsonc-parser';

// Pinned 3.3.1 token values. Its declaration uses ambient const enums, which cannot
// be consumed with this repository's isolatedModules setting.
const TOKEN = { eof: 17, whitespace: 15, newline: 14, number: 11 } as const;

export const JSON_LIMITS = {
  bytes: 256 * 1024,
  depth: 20,
  members: 128,
  elements: 4096,
  tokens: 50_000,
  keyBytes: 80,
  stringBytes: 4096,
  numberCharacters: 64,
} as const;

export class StrictJsonError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'StrictJsonError';
  }
}
const encoder = new TextEncoder();
export const utf8Length = (text: string) => encoder.encode(text).byteLength;

export function assertUnicode(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new StrictJsonError('UNICODE', 'Unpaired UTF-16 surrogate');
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new StrictJsonError('UNICODE', 'Unpaired UTF-16 surrogate');
    }
  }
}

/** Preflight must finish before native object construction. Shared by files, HTTP and IPC. */
export function decodeStrictJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength > JSON_LIMITS.bytes)
    throw new StrictJsonError('BODY_SIZE', 'JSON exceeds 256 KiB', 413);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    throw new StrictJsonError('BOM', 'UTF-8 BOM is not accepted');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new StrictJsonError('UTF8', 'Malformed UTF-8');
  }
  const scanner = createScanner(text, false);
  let tokens = 0;
  for (let token = scanner.scan(); token !== TOKEN.eof; token = scanner.scan()) {
    if (scanner.getTokenError() !== 0) throw new StrictJsonError('SYNTAX', 'Invalid JSON token');
    if (token === TOKEN.whitespace || token === TOKEN.newline) continue;
    if (++tokens > JSON_LIMITS.tokens) throw new StrictJsonError('TOKENS', 'Too many JSON tokens');
    if (
      token === TOKEN.number &&
      (scanner.getTokenLength() > JSON_LIMITS.numberCharacters ||
        !Number.isFinite(Number(scanner.getTokenValue())))
    )
      throw new StrictJsonError('NUMBER', 'Invalid or excessive JSON number');
  }
  type Container = { kind: 'object'; keys: Set<string> } | { kind: 'array'; count: number };
  const stack: Container[] = [];
  const value = () => {
    const parent = stack.at(-1);
    if (parent?.kind === 'array' && ++parent.count > JSON_LIMITS.elements)
      throw new StrictJsonError('ELEMENTS', 'Too many array elements');
  };
  const begin = (container: Container) => {
    value();
    if (stack.length >= JSON_LIMITS.depth)
      throw new StrictJsonError('DEPTH', 'JSON nesting exceeds 20');
    stack.push(container);
  };
  visit(
    text,
    {
      onObjectBegin: () => begin({ kind: 'object', keys: new Set() }),
      onObjectEnd: () => {
        stack.pop();
      },
      onArrayBegin: () => begin({ kind: 'array', count: 0 }),
      onArrayEnd: () => {
        stack.pop();
      },
      onObjectProperty: (key) => {
        assertUnicode(key);
        if (utf8Length(key) > JSON_LIMITS.keyBytes)
          throw new StrictJsonError('KEY_SIZE', 'JSON key exceeds 80 UTF-8 bytes');
        const parent = stack.at(-1);
        if (parent?.kind !== 'object') throw new StrictJsonError('SYNTAX', 'Invalid object');
        if (parent.keys.has(key)) throw new StrictJsonError('DUPLICATE_KEY', 'Duplicate JSON key');
        parent.keys.add(key);
        if (parent.keys.size > JSON_LIMITS.members)
          throw new StrictJsonError('MEMBERS', 'Too many object members');
      },
      onLiteralValue: (literal) => {
        value();
        if (typeof literal === 'string') {
          assertUnicode(literal);
          if (utf8Length(literal) > JSON_LIMITS.stringBytes)
            throw new StrictJsonError('STRING_SIZE', 'JSON string exceeds 4096 UTF-8 bytes');
        }
        if (typeof literal === 'number' && !Number.isFinite(literal))
          throw new StrictJsonError('NUMBER', 'JSON number must be finite');
      },
      onError: () => {
        throw new StrictJsonError('SYNTAX', 'Malformed JSON');
      },
    },
    { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false },
  );
  return JSON.parse(text) as unknown;
}

/** Does not trust Content-Length and cancels the reader as soon as the byte cap is exceeded. */
export async function readCommunityJson(request: Request): Promise<unknown> {
  const encoding = request.headers.get('content-encoding');
  if (encoding !== null && encoding.trim().toLowerCase() !== 'identity')
    throw new StrictJsonError('ENCODING', 'Only identity content encoding is accepted', 415);
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(type))
    throw new StrictJsonError('CONTENT_TYPE', 'Use application/json with UTF-8', 415);
  if (!request.body) throw new StrictJsonError('SYNTAX', 'JSON body is required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > JSON_LIMITS.bytes) {
        await reader.cancel();
        throw new StrictJsonError('BODY_SIZE', 'JSON exceeds 256 KiB', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeStrictJson(bytes);
}
