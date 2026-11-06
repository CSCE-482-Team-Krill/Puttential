import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  prepareCommunityCandidate,
  verifyCommunityCandidate,
  communityPublicationHash,
  validateCommunityProof,
  normalizePublicationMetadata,
} from '../src/shared/community-candidate';
import { canonicalJson, hashCanonical } from '../src/shared/community-canonical-json';
import { makePlacement, replayRun } from '../src/game/run-evaluation';
import { freshDocument, place, presets } from '../level-editor/editor/model';
import vector from './fixtures/canonical-v1/solved-course.json';
import scenes from './fixtures/canonical-v1/replay-scenes.json';

test('canonical candidate bytes and full identity chain match committed golden values', async () => {
  const candidate = await prepareCommunityCandidate(vector.input, vector.levelId, vector.engine);
  assert.deepEqual(candidate, vector.candidate);
  assert.equal(canonicalJson(candidate), vector.canonicalCandidate);
  assert.equal(
    await hashCanonical({}),
    '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  );
  assert.equal(
    await communityPublicationHash(candidate.candidateHash, vector.metadata),
    vector.publicationHash,
  );
  assert.equal(
    await validateCommunityProof(candidate, vector.candidateId, vector.proof, vector.engine),
    vector.proofHash,
  );
  await verifyCommunityCandidate(candidate, vector.engine);
  assert.deepEqual(
    await replayRun(candidate.configuration, vector.proof.placement, candidate.rules),
    vector.result,
  );
});
test('equivalent key order, explicit defaults, imported identity and negative zero preserve candidate', async () => {
  const input = structuredClone(vector.input) as any;
  input.level.id = 'another-import';
  input.level.version = 99;
  input.level.gravity.y = -0;
  const body = input.level.dynamicBodies[0];
  body.linearVelocity = { y: -0, x: 0 };
  body.angularVelocity = -0;
  body.canSleep = true;
  body.pieces[0].density = body.density;
  input.level.prediction = { sampleEveryTicks: 8, maxTicks: 1200 };
  const reverseKeys = (value: any): any =>
    Array.isArray(value)
      ? value.map(reverseKeys)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, value]) => [key, reverseKeys(value)]),
          )
        : value;
  assert.deepEqual(
    await prepareCommunityCandidate(reverseKeys(input), vector.levelId, vector.engine),
    vector.candidate,
  );
  const doc = place(
    freshDocument(),
    presets.find((p) => p.force === 'portal')!,
    { x: 0, y: 0 },
  ).doc;
  const implicit = await prepareCommunityCandidate(doc, vector.levelId, vector.engine);
  for (const field of doc.level.fields)
    if (field.force.kind === 'portal')
      Object.assign(field.force, { delaySeconds: 0.25, cooldownSeconds: 0.75 });
  assert.deepEqual(await prepareCommunityCandidate(doc, vector.levelId, vector.engine), implicit);
});
test('array order, board, server level and exact engine artifact remain distinct identities', async () => {
  const reorder = structuredClone(vector.input);
  reorder.level.staticBodies.reverse();
  assert.notEqual(
    (await prepareCommunityCandidate(reorder, vector.levelId, vector.engine)).gameHash,
    vector.candidate.gameHash,
  );
  const board = structuredClone(vector.input);
  board.editor.arena.walls = [];
  board.level.staticBodies = [];
  board.editor.arena.bounds.maxX = 8;
  (board.level as any).bounds = { ...board.editor.arena.bounds };
  assert.notEqual(
    (await prepareCommunityCandidate(board, vector.levelId, vector.engine)).gameHash,
    vector.candidate.gameHash,
  );
  assert.notEqual(
    (
      await prepareCommunityCandidate(
        vector.input,
        '00000000-0000-4000-8000-000000000001',
        vector.engine,
      )
    ).gameHash,
    vector.candidate.gameHash,
  );
  const changedEngine = { ...vector.engine, artifactDigest: '0'.repeat(64) };
  const candidate = await prepareCommunityCandidate(vector.input, vector.levelId, changedEngine);
  assert.notEqual(candidate.candidateHash, vector.candidate.candidateHash);
  await assert.rejects(verifyCommunityCandidate(candidate, vector.engine), /unavailable/);
});
test('metadata-only releases retain gameplay/proof identity but change publication identity', async () => {
  const changed = { ...vector.metadata, title: 'A new course title' };
  assert.notEqual(
    await communityPublicationHash(vector.candidate.candidateHash, changed),
    vector.publicationHash,
  );
  assert.notEqual(
    await communityPublicationHash(vector.candidate.candidateHash, {
      ...vector.metadata,
      description: 'New description',
    }),
    vector.publicationHash,
  );
  assert.equal(
    await validateCommunityProof(vector.candidate, vector.candidateId, vector.proof, vector.engine),
    vector.proofHash,
  );
  assert.deepEqual(
    normalizePublicationMetadata({
      title: '  Cafe\u0301 course ',
      description: '  A 😀 course with  two spaces.  ',
      creatorNameSnapshot: ' Creator ',
    }),
    vector.metadata,
  );
  await assert.rejects(
    communityPublicationHash(vector.candidate.candidateHash, {
      ...changed,
      title: '  Unnormalized  ',
    }),
    /normalized/,
  );
});
test('tampered candidate identities, proofs, inventory and extra commands fail closed', async () => {
  for (const mutate of [
    (p: any) => {
      p.candidateHash = '0'.repeat(64);
    },
    (p: any) => {
      p.candidateId = '00000000-0000-4000-8000-000000000000';
    },
    (p: any) => {
      p.engineArtifactDigest = '0'.repeat(64);
    },
    (p: any) => {
      p.placement.levelVersion = 2;
    },
    (p: any) => {
      p.placement.commands[0].fieldId = 'left-rail';
    },
    (p: any) => {
      p.placement.commands[0].xQ += 0.1;
    },
    (p: any) => {
      p.placement.commands[1].angleQ = 3600;
    },
    (p: any) => {
      p.placement.commands.pop();
    },
    (p: any) => {
      p.placement.commands[0].extra = 1;
    },
    (p: any) => {
      p.success = true;
    },
  ]) {
    const proof = structuredClone(vector.proof);
    mutate(proof);
    await assert.rejects(
      validateCommunityProof(vector.candidate, vector.candidateId, proof, vector.engine),
    );
  }
  const candidate = structuredClone(vector.candidate);
  candidate.rules.maxTicks = 1;
  await assert.rejects(verifyCommunityCandidate(candidate, vector.engine), /mismatch/);
});
test('the exact immutable engine module replays the golden solve in Node', async () => {
  const url = pathToFileURL(
    path.resolve(`artifacts/community-editor/engine/${vector.engine.artifactDigest}.mjs`),
  ).href;
  const engine = await import(url);
  assert.deepEqual(
    await engine.replayRun(
      vector.candidate.configuration,
      vector.proof.placement,
      vector.candidate.rules,
    ),
    vector.result,
  );
});
test('hostile command IDs cannot reach inherited setup properties', async () => {
  const before = Object.getOwnPropertyDescriptor(Object, 'position');
  for (const id of ['constructor', '__proto__', 'prototype']) {
    const proof = structuredClone(vector.proof);
    proof.placement.commands[0]!.fieldId = id;
    await assert.rejects(
      validateCommunityProof(vector.candidate, vector.candidateId, proof, vector.engine),
      /Unknown or fixed/,
    );
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(Object, 'position'), before);
});
test('canonical scene vectors preserve moving circles, compound bodies, concave fields, hazards, portals and open bounds', async () => {
  const engine = await import(
    pathToFileURL(
      path.resolve(`artifacts/community-editor/engine/${vector.engine.artifactDigest}.mjs`),
    ).href
  );
  for (const scene of scenes) {
    const candidate = await prepareCommunityCandidate(scene.input, vector.levelId, vector.engine);
    assert.deepEqual(candidate, scene.candidate, scene.name);
    assert.deepEqual(
      await engine.replayRun(candidate.configuration, scene.placement, candidate.rules),
      scene.result,
      scene.name,
    );
    assert.deepEqual(
      await replayRun(candidate.configuration, scene.placement, candidate.rules),
      scene.result,
      scene.name,
    );
  }
});
