// Explicit review-fixture generation; never runs as part of tests/CI.
import { writeFile, mkdir } from 'node:fs/promises';
import { freshDocument, place, presets } from '../src/editor/model';
import {
  prepareCommunityCandidate,
  communityPublicationHash,
  normalizePublicationMetadata,
  validateCommunityProof,
} from '../src/shared/community-candidate';
import { canonicalJson } from '../src/shared/community-canonical-json';
import { makePlacement, replayRun } from '../src/game/run-evaluation';
import manifest from '../src/community-verifier/engine-manifest.json';
import { openingCourse } from '../src/backend/daily-courses';
import { parseDocument } from '../src/game/levels/codec';
import type { LevelDocument } from '../src/game/levels/codec';

async function main() {
  const engine = {
    simulationVersion: manifest.simulationVersion,
    rulesVersion: manifest.rulesVersion,
    artifactDigest: manifest.artifactDigest,
  };
  const levelId = 'b3c12425-cca4-43a5-a6af-02e2c2a4e843';
  const candidateId = '04784c12-c0ad-4637-a3ed-f9eadb1851f1';
  const input = place(
    freshDocument(),
    presets.find((p) => p.force === 'uniform')!,
    { x: 0, y: 0 },
  ).doc;
  input.level.goal = { bodyId: 'ball', minX: -5, maxX: -3, minY: -1, maxY: 1, holdSeconds: 0.05 };
  const candidate = await prepareCommunityCandidate(input, levelId, engine);
  const draft = Object.fromEntries(
    candidate.configuration.fields.map((field) => [
      field.id,
      { position: field.position, angle: field.angle, enabled: false },
    ]),
  );
  const placement = makePlacement(candidate.configuration, draft, candidate.rules);
  const proof = {
    candidateId,
    candidateHash: candidate.candidateHash,
    engineArtifactDigest: engine.artifactDigest,
    placement,
  };
  const metadata = normalizePublicationMetadata({
    title: '  Cafe\u0301 course  ',
    description: '  A 😀 course with  two spaces.  ',
    creatorNameSnapshot: '  Creator  ',
  });
  const result = await replayRun(candidate.configuration, placement, candidate.rules);
  const vector = {
    input,
    levelId,
    candidateId,
    engine,
    candidate,
    metadata,
    publicationHash: await communityPublicationHash(candidate.candidateHash, metadata),
    proof,
    proofHash: await validateCommunityProof(candidate, candidateId, proof, engine),
    result,
    canonicalCandidate: canonicalJson(candidate),
  };
  await mkdir('tests/fixtures/canonical-v1', { recursive: true });
  await writeFile(
    'tests/fixtures/canonical-v1/solved-course.json',
    JSON.stringify(vector, null, 2) + '\n',
  );
  const scenes: {
    name: string;
    document: LevelDocument;
    commands?: typeof placement.commands;
    expected: string;
  }[] = [];
  for (let i = 0; i < 4; i++) {
    const course = openingCourse(i);
    scenes.push({
      name: `moving-circle-${i}`,
      document: parseDocument(course.level),
      commands: course.solutions[0]!.commands,
      expected: 'success',
    });
  }
  const compound = openingCourse(0);
  const compoundDocument = parseDocument(compound.level);
  (compoundDocument.level.dynamicBodies[0]!.pieces as any[]).push({
    id: 'center-piece',
    shape: { kind: 'rectangle', width: 0.15, height: 0.15 },
  });
  scenes.push({
    name: 'compound-body',
    document: compoundDocument,
    commands: compound.solutions[0]!.commands,
    expected: 'success',
  });
  const concave = parseDocument(compound.level);
  (concave.level.fields[0] as any).shape = {
    kind: 'polygon',
    points: [
      { x: -1.2, y: -0.8 },
      { x: 1.2, y: -0.8 },
      { x: 1.2, y: 0.6 },
      { x: 0.6, y: 0.6 },
      { x: 0.6, y: 0.8 },
      { x: -1.2, y: 0.8 },
    ],
  };
  scenes.push({
    name: 'concave-field',
    document: concave,
    commands: compound.solutions[0]!.commands,
    expected: 'success',
  });
  for (const kind of ['water', 'lava'] as const) {
    const document = freshDocument();
    document.level.fields = [
      {
        id: kind,
        shape: { kind: 'rectangle', width: 2, height: 2 },
        position: { x: -4, y: 0 },
        angle: 0,
        enabled: true,
        force: kind === 'water' ? { kind, drag: 12, sinkSpeed: 0.06 } : { kind },
      },
    ];
    scenes.push({ name: `${kind}-failure`, document, expected: kind });
  }
  const portals = freshDocument();
  portals.level.fields = [-4, 4].map((x, i) => ({
    id: `portal-${i}`,
    shape: { kind: 'rectangle', width: 2, height: 2 },
    position: { x, y: 0 },
    angle: 0,
    enabled: true,
    force: { kind: 'portal', pairId: 'pair-1', rotateVelocity: false },
  }));
  portals.level.goal = { bodyId: 'ball', minX: 3, maxX: 5, minY: -1, maxY: 1, holdSeconds: 0.05 };
  scenes.push({ name: 'delayed-portals', document: portals, expected: 'success' });
  const borderless = freshDocument();
  borderless.editor.arena.walls = [];
  borderless.level.staticBodies = [];
  (borderless.level.dynamicBodies[0] as any).linearVelocity = { x: 2, y: 0 };
  scenes.push({
    name: 'borderless-failure',
    document: structuredClone(borderless),
    expected: 'out-of-bounds',
  });
  borderless.level.goal = { ...borderless.level.goal, holdSeconds: 0.05 };
  scenes.push({ name: 'borderless-board', document: borderless, expected: 'success' });
  const replayVectors = [];
  for (const scene of scenes) {
    const candidate = await prepareCommunityCandidate(scene.document, levelId, engine);
    const placement = scene.commands
      ? {
          levelId: candidate.configuration.id,
          levelVersion: 1,
          simulationVersion: engine.simulationVersion,
          rulesVersion: engine.rulesVersion,
          commands: scene.commands,
        }
      : makePlacement(candidate.configuration, {}, candidate.rules);
    const result = await replayRun(candidate.configuration, placement, candidate.rules);
    if (result.outcome !== scene.expected)
      throw new Error(`${scene.name}: expected ${scene.expected}, got ${result.outcome}`);
    replayVectors.push({ name: scene.name, input: scene.document, candidate, placement, result });
  }
  await writeFile(
    'tests/fixtures/canonical-v1/replay-scenes.json',
    JSON.stringify(replayVectors, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      gameHash: candidate.gameHash,
      candidateHash: candidate.candidateHash,
      result,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
