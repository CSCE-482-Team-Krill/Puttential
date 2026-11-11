import { parseLevel } from '../game/levels/parse';
import { defaultRules, RULES_VERSION, SIMULATION_VERSION } from '../game/run-evaluation';
import { validateCommunityPlacement } from './community-placement';
import { COMMUNITY_CONTRACT } from './community-contracts';
import type {
  CanonicalCandidate,
  CommunityProof,
  EngineArtifact,
  PublicationMetadata,
} from './community-contracts';
import { canonicalJson, hashCanonical } from './community-canonical-json';
import { COMMUNITY_PROFILE, validateCommunityDocument } from './community-profile';
import { assertUnicode, utf8Length } from './strict-json';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
export function assertEngineArtifact(engine: EngineArtifact): void {
  if (
    canonicalJson(Object.keys(engine).sort()) !==
      canonicalJson(['artifactDigest', 'rulesVersion', 'simulationVersion']) ||
    engine.rulesVersion !== RULES_VERSION ||
    engine.simulationVersion !== SIMULATION_VERSION ||
    !hash.test(engine.artifactDigest)
  )
    throw new Error('Unsupported engine artifact');
}

/** Run in the contained preparation process. levelId and engine come from trusted storage/registry. */
export async function prepareCommunityCandidate(
  input: unknown,
  levelId: string,
  engine: EngineArtifact,
): Promise<CanonicalCandidate> {
  if (!uuid.test(levelId)) throw new Error('Expected server-issued level UUID');
  assertEngineArtifact(engine);
  const document = validateCommunityDocument(input);
  const { id: _authoredId, version: _authoredVersion, ...properties } = document.level;
  const C0 = {
    ...properties,
    bounds: { ...document.editor.arena.bounds },
    dynamicBodies: properties.dynamicBodies.map((body) => ({
      ...body,
      linearVelocity: body.linearVelocity ?? { x: 0, y: 0 },
      angularVelocity: body.angularVelocity ?? 0,
      canSleep: body.canSleep ?? true,
      pieces: body.pieces.map((piece) => ({ ...piece, density: piece.density ?? body.density })),
    })),
    fields: properties.fields.map((field) => ({
      ...field,
      force:
        field.force.kind === 'portal'
          ? {
              ...field.force,
              delaySeconds: field.force.delaySeconds ?? 0.25,
              cooldownSeconds: field.force.cooldownSeconds ?? 0.75,
            }
          : field.force,
    })),
    prediction: properties.prediction ?? { maxTicks: 1200, sampleEveryTicks: 8 },
  };
  const rules = defaultRules({ ...C0, id: 'candidate', version: 1 });
  const gameHash = await hashCanonical({
    tag: 'puttential-community-game-v1',
    levelId,
    profile: COMMUNITY_PROFILE,
    E: engine,
    C0,
    rules,
  });
  const configuration = parseLevel({ ...C0, id: `c-${gameHash}`, version: 1 });
  const canonicalConfiguration = canonicalJson(configuration);
  if (utf8Length(canonicalConfiguration) > 128 * 1024)
    throw new Error('Canonical configuration exceeds 128 KiB');
  const candidateHash = await hashCanonical({
    tag: 'puttential-community-candidate-v1',
    profile: COMMUNITY_PROFILE,
    E: engine,
    configuration,
    rules,
  });
  return {
    contract: COMMUNITY_CONTRACT,
    profile: COMMUNITY_PROFILE,
    levelId,
    engine: { ...engine },
    configuration,
    rules,
    gameHash,
    candidateHash,
  };
}

/** Reconstruct the identity chain and defaults; never trust a claimed hash or mutable draft. */
export async function verifyCommunityCandidate(
  candidate: CanonicalCandidate,
  admitted: EngineArtifact,
): Promise<void> {
  assertEngineArtifact(admitted);
  if (canonicalJson(candidate.engine) !== canonicalJson(admitted))
    throw new Error('Engine artifact unavailable');
  if (
    candidate.contract !== COMMUNITY_CONTRACT ||
    candidate.profile !== COMMUNITY_PROFILE ||
    !hash.test(candidate.gameHash) ||
    !hash.test(candidate.candidateHash) ||
    candidate.configuration.id !== `c-${candidate.gameHash}` ||
    candidate.configuration.version !== 1
  )
    throw new Error('Invalid candidate identity');
  const restored = await prepareCommunityCandidate(
    candidate.configuration,
    candidate.levelId,
    admitted,
  );
  if (canonicalJson(restored) !== canonicalJson(candidate))
    throw new Error('Candidate hash mismatch');
}

export function normalizePublicationMetadata(metadata: PublicationMetadata): PublicationMetadata {
  const normalize = (text: string, min: number, max: number, name: string) => {
    if (typeof text !== 'string') throw new Error(`${name} must be text`);
    assertUnicode(text);
    const value = text.normalize('NFC').trim();
    if ([...value].length < min || [...value].length > max || utf8Length(value) > max * 4)
      throw new Error(`${name} must contain ${min}–${max} characters`);
    return value;
  };
  return {
    title: normalize(metadata.title, 3, 80, 'Title'),
    description: normalize(metadata.description, 0, 1000, 'Description'),
    creatorNameSnapshot: normalize(metadata.creatorNameSnapshot, 3, 80, 'Creator name'),
  };
}
/** Metadata has already been normalized once at save. Reject a different snapshot here. */
export async function communityPublicationHash(
  candidateHash: string,
  metadata: PublicationMetadata,
): Promise<string> {
  if (
    !hash.test(candidateHash) ||
    canonicalJson(normalizePublicationMetadata(metadata)) !== canonicalJson(metadata)
  )
    throw new Error('Expected saved normalized publication metadata');
  return hashCanonical({ tag: 'puttential-community-publication-v1', candidateHash, ...metadata });
}

export async function validateCommunityProof(
  candidate: CanonicalCandidate,
  candidateId: string,
  proof: CommunityProof,
  admitted: EngineArtifact,
): Promise<string> {
  await verifyCommunityCandidate(candidate, admitted);
  if (
    !uuid.test(candidateId) ||
    proof.candidateId !== candidateId ||
    proof.candidateHash !== candidate.candidateHash ||
    proof.engineArtifactDigest !== admitted.artifactDigest ||
    canonicalJson(Object.keys(proof).sort()) !==
      canonicalJson(['candidateHash', 'candidateId', 'engineArtifactDigest', 'placement'])
  )
    throw new Error('Proof does not bind the exact candidate');
  validateCommunityPlacement(candidate.configuration, candidate.rules, proof.placement);
  return hashCanonical({
    tag: 'puttential-community-proof-v1',
    candidateHash: candidate.candidateHash,
    placement: proof.placement,
  });
}
