import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeStrictJson,
  readCommunityJson,
  StrictJsonError,
  JSON_LIMITS,
} from '../src/shared/strict-json';
import { canonicalJson, hashCanonical } from '../src/shared/community-canonical-json';

const bytes = (text: string) => new TextEncoder().encode(text);
const decode = (text: string) => decodeStrictJson(bytes(text));
test('strict transport rejects hostile syntax before native object construction', () => {
  const cases = [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"a":{"b":1,"b":2}}',
    '\ufeff{}',
    '[1,]',
    '{/*x*/"a":1}',
    '//comment\n{}',
    '1 2',
    '',
    '01',
    '+1',
    'NaN',
    '1e999',
    '"\\ud800"',
    '"\\udfff"',
    '{"\\ud800":1}',
    '"\ud800"',
    '"\u0000"',
    '"a\nb"',
    'true garbage',
    '{"a":undefined}',
    '1'.repeat(65),
  ];
  for (const raw of cases) {
    // A literal unpaired surrogate cannot survive UTF-8 encoding; test escaped form above.
    if (raw === '"\ud800"') continue;
    assert.throws(() => decode(raw), StrictJsonError, JSON.stringify(raw));
  }
  const original = JSON.parse;
  let invoked = false;
  JSON.parse = (() => {
    invoked = true;
    throw new Error('Native parser reached');
  }) as typeof JSON.parse;
  try {
    assert.throws(() => decode('{"x":0,"x":1}'), /Duplicate/);
  } finally {
    JSON.parse = original;
  }
  assert.equal(invoked, false);
  for (const invalid of [
    [0xc0, 0x80],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
    [0xe2, 0x82],
  ])
    assert.throws(() => decodeStrictJson(new Uint8Array(invalid)), /UTF-8/);
});
test('strict decoder enforces container, token, string and byte boundaries', () => {
  assert.doesNotThrow(() => decode('['.repeat(20) + '0' + ']'.repeat(20)));
  assert.throws(() => decode('['.repeat(21) + '0' + ']'.repeat(21)), /nesting/);
  assert.doesNotThrow(() => decode(JSON.stringify(Array(4096).fill(null))));
  assert.throws(() => decode(JSON.stringify(Array(4097).fill(null))), /elements/);
  assert.doesNotThrow(() =>
    decode(JSON.stringify(Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`k${i}`, i])))),
  );
  assert.throws(
    () =>
      decode(
        JSON.stringify(Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`k${i}`, i]))),
      ),
    /members/,
  );
  assert.doesNotThrow(() => decode(JSON.stringify('é'.repeat(2048))));
  assert.throws(() => decode(JSON.stringify('é'.repeat(2049))), /4096/);
  assert.throws(() => decode(JSON.stringify({ ['é'.repeat(41)]: 1 })), /80/);
  assert.throws(() => decodeStrictJson(new Uint8Array(JSON_LIMITS.bytes + 1)), /256 KiB/);
  assert.throws(
    () => decode(JSON.stringify(Array.from({ length: 100 }, () => Array(300).fill(0)))),
    /tokens/,
  );
  assert.deepEqual(decode('{"x":"\\ud83d\\ude00", "a":[1,{},[]]}'), { x: '😀', a: [1, {}, []] });
});
test('community HTTP decoder bounds streamed bytes without trusting content length', async () => {
  let canceled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(65_536));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
    body,
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(
    readCommunityJson(request),
    (error: StrictJsonError) => error.status === 413,
  );
  assert.equal(canceled, true);
  for (const headers of [
    { 'Content-Type': 'text/plain' },
    { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    { 'Content-Type': 'application/json; charset=utf-16' },
  ])
    await assert.rejects(
      readCommunityJson(new Request('http://localhost/', { method: 'POST', headers, body: '{}' })),
      (error: StrictJsonError) => error.status === 415,
    );
  assert.deepEqual(
    await readCommunityJson(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: '{"a":1}',
      }),
    ),
    { a: 1 },
  );
});
test('pinned JCS rejects non-JSON values and preserves RFC property and number ordering', async () => {
  assert.equal(
    await hashCanonical({}),
    '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  );
  assert.equal(
    canonicalJson({ z: -0, b: [1e30, 0.002, 1e-27], a: 'é' }),
    '{"a":"é","b":[1e+30,0.002,1e-27],"z":0}',
  );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  for (const value of [
    undefined,
    NaN,
    Infinity,
    1n,
    new Date(),
    new Map(),
    { a: undefined },
    { a: '\ud800' },
    [undefined],
    new Array(2),
    cyclic,
    {
      toJSON() {
        return {};
      },
    },
    Object.defineProperty({}, 'a', {
      get() {
        throw new Error('Getter executed');
      },
      enumerable: true,
    }),
  ])
    assert.throws(() => canonicalJson(value));
});
