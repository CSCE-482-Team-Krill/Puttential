import type {
  CanonicalCandidate,
  CommunityProof,
  EngineArtifact,
} from '../shared/community-contracts';
import { prepareCommunityCandidate, validateCommunityProof } from '../shared/community-candidate';
import { canonicalJson, hashCanonical } from '../shared/community-canonical-json';
import { decodeStrictJson, utf8Length } from '../shared/strict-json';
import type { Assignment } from './lifecycle';
import { simulationOptions } from '../game/run-evaluation';

export type VerifierInput = {
  contract: 'community-work-v1';
  assignment: Assignment;
  engine: EngineArtifact;
} & (
  | { kind: 'prepare'; levelId: string; document: unknown }
  | { kind: 'publish'; candidateId: string; candidate: CanonicalCandidate; proof: CommunityProof }
);
export type ArtifactEngine = Pick<typeof import('./engine-entry'), 'replayRun' | 'createGame'>;

/** CPU-only work. No DB, HTTP, guest/session or publication commit capability. */
export async function performCommunityWork(input: VerifierInput, artifact: ArtifactEngine) {
  const inputHash = await hashCanonical(input);
  if (
    input.contract !== 'community-work-v1' ||
    ![0, 1].includes(input.assignment.unitNumber) ||
    !Number.isSafeInteger(input.assignment.attemptNumber) ||
    input.assignment.attemptNumber < 1 ||
    input.assignment.attemptNumber > 5 ||
    ![
      input.assignment.jobId,
      input.assignment.runnerGeneration,
      input.assignment.attemptFence,
    ].every((value) => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value))
  )
    throw new Error('Invalid work contract');
  let result: unknown;
  if (input.kind === 'prepare') {
    result = {
      kind: 'ready',
      candidate: await prepareCommunityCandidate(input.document, input.levelId, input.engine),
    };
  } else if (input.kind === 'publish') {
    const proofHash = await validateCommunityProof(
      input.candidate,
      input.candidateId,
      input.proof,
      input.engine,
    );
    const outcome = await artifact.replayRun(
      input.candidate.configuration,
      input.proof.placement,
      input.candidate.rules,
    );
    if (outcome.outcome !== 'success') {
      const failed = { kind: 'validation-failed', code: 'PROOF_FAILED' };
      return {
        assignment: input.assignment,
        inputHash,
        result: failed,
        resultHash: await hashCanonical(failed),
      };
    }
    // Full cap, with every selectable field enabled at the canonical proof placement.
    // Never terminate the benchmark because the author's successful proof ended early.
    const benchmarkStarted = performance.now();
    const game = await artifact.createGame(
      input.candidate.configuration,
      simulationOptions(input.candidate.rules),
    );
    try {
      game.applySetup(
        input.proof.placement.commands.map((command) =>
          command.type === 'set-field-enabled' ? { ...command, enabled: true } : command,
        ),
      );
      for (let tick = 0; tick < 7200; tick++) game.step();
    } finally {
      game.destroy();
    }
    const benchmarkMs = performance.now() - benchmarkStarted;
    if (benchmarkMs >= 3000) result = { kind: 'validation-failed', code: 'RESOURCE_BUDGET' };
    else result = { kind: 'verified', proofHash, outcome, benchmarkTicks: 7200, benchmarkMs };
  } else throw new Error('Unsupported work kind');
  const output = {
    assignment: input.assignment,
    inputHash,
    result,
    resultHash: await hashCanonical(result),
  };
  if (utf8Length(canonicalJson(output)) > 256 * 1024)
    throw new Error('Verifier output exceeds limit');
  return output;
}

export function decodeVerifierInput(bytes: Uint8Array): VerifierInput {
  const input = decodeStrictJson(bytes);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected verifier work');
  const object = input as Record<string, unknown>;
  const keys = [
    'contract',
    'assignment',
    'engine',
    'kind',
    ...(object.kind === 'prepare'
      ? ['levelId', 'document']
      : ['candidateId', 'candidate', 'proof']),
  ];
  if (
    Object.keys(object).length !== keys.length ||
    Object.keys(object).some((key) => !keys.includes(key))
  )
    throw new Error('Unknown work property');
  return input as VerifierInput;
}
