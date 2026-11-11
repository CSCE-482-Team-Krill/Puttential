import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vector from './fixtures/canonical-v1/solved-course.json';
import scenes from './fixtures/canonical-v1/replay-scenes.json';

let server: Server;
let origin: string;
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['tests/community-browser.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'CommunityContract',
    platform: 'browser',
    target: 'es2022',
  });
  const engine = await readFile(
    `artifacts/community-editor/engine/${vector.engine.artifactDigest}.mjs`,
  );
  expect(createHash('sha256').update(engine).digest('hex')).toBe(vector.engine.artifactDigest);
  server = createServer((request, response) => {
    if (request.url === '/contracts.js' || request.url === '/engine.mjs') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(request.url === '/contracts.js' ? bundle.outputFiles[0]!.contents : engine);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        '<!doctype html><title>Community contract evidence</title><script src="/contracts.js"></script>',
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

test('real Chromium matches canonical bytes, four hashes, strict decoding and exact-engine replay', async ({
  page,
}) => {
  await page.goto(origin);
  const actual = await page.evaluate(async (fixture) => {
    const api = (window as any).CommunityContract;
    const candidate = await api.prepareCommunityCandidate(
      fixture.input,
      fixture.levelId,
      fixture.engine,
    );
    const engine = await import('/engine.mjs');
    const result = await engine.replayRun(
      candidate.configuration,
      fixture.proof.placement,
      candidate.rules,
    );
    return {
      candidate,
      bytes: api.canonicalJson(candidate),
      sanity: await api.hashCanonical({}),
      publicationHash: await api.communityPublicationHash(
        candidate.candidateHash,
        fixture.metadata,
      ),
      proofHash: await api.validateCommunityProof(
        candidate,
        fixture.candidateId,
        fixture.proof,
        fixture.engine,
      ),
      result,
    };
  }, vector);
  expect(actual).toEqual({
    candidate: vector.candidate,
    bytes: vector.canonicalCandidate,
    sanity: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    publicationHash: vector.publicationHash,
    proofHash: vector.proofHash,
    result: vector.result,
  });
});
test('Chromium rejects hostile transport before native construction with matching limits', async ({
  page,
}) => {
  await page.goto(origin);
  const result = await page.evaluate(() => {
    const api = (window as any).CommunityContract;
    const raw = [
      '{"a":1,"a":2}',
      '{"a":1,"\\u0061":2}',
      '"\\ud800"',
      '"\\udfff"',
      '1e999',
      '01',
      '1 2',
      '[1,]',
      '{/*comment*/"a":1}',
      '\ufeff{}',
      '['.repeat(21) + '0' + ']'.repeat(21),
      JSON.stringify(Array(4097).fill(0)),
      JSON.stringify('é'.repeat(2049)),
      '1'.repeat(65),
      JSON.stringify(Array.from({ length: 100 }, () => Array(300).fill(0))),
    ];
    const errors = raw.map((text) => {
      try {
        api.decodeStrictJson(new TextEncoder().encode(text));
        return null;
      } catch (error) {
        return (error as any).code;
      }
    });
    let invalidUtf8 = false;
    try {
      api.decodeStrictJson(new Uint8Array([0xed, 0xa0, 0x80]));
    } catch {
      invalidUtf8 = true;
    }
    const native = JSON.parse;
    let nativeCalled = false;
    JSON.parse = (() => {
      nativeCalled = true;
      throw new Error('Unexpected native construction');
    }) as any;
    try {
      api.decodeStrictJson(new TextEncoder().encode('{"a":1,"a":2}'));
    } catch {
      /* expected */
    } finally {
      JSON.parse = native;
    }
    return {
      errors,
      invalidUtf8,
      nativeCalled,
      equivalent: api.canonicalJson(
        api.decodeStrictJson(new TextEncoder().encode('{"b":1e0,"a":-0}')),
      ),
    };
  });
  expect(result.errors).not.toContain(null);
  expect(result.invalidUtf8).toBe(true);
  expect(result.nativeCalled).toBe(false);
  expect(result.equivalent).toBe('{"a":0,"b":1}');
});

test('Chromium replays every canonical motion, hazard, portal and bounds golden scene', async ({
  page,
}) => {
  await page.goto(origin);
  const results = await page.evaluate(
    async ({ scenes, levelId, engine: expectedEngine }) => {
      const api = (window as any).CommunityContract;
      const engine = await import('/engine.mjs');
      const results = [];
      for (const scene of scenes) {
        const candidate = await api.prepareCommunityCandidate(scene.input, levelId, expectedEngine);
        results.push({
          name: scene.name,
          candidate,
          result: await engine.replayRun(candidate.configuration, scene.placement, candidate.rules),
        });
      }
      return results;
    },
    { scenes, levelId: vector.levelId, engine: vector.engine },
  );
  expect(results).toEqual(
    scenes.map((scene) => ({ name: scene.name, candidate: scene.candidate, result: scene.result })),
  );
});
