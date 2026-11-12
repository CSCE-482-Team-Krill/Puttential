import type { Level } from '../game/levels/types';
import type { Placement, PuzzleRules } from './puzzle-contracts';

export const COMMUNITY_CONTRACT = 'community-record-v1';
export type EngineArtifact = {
  simulationVersion: string;
  rulesVersion: string;
  artifactDigest: string;
};
export type CanonicalCandidate = {
  contract: typeof COMMUNITY_CONTRACT;
  profile: 'community-v1';
  levelId: string;
  engine: EngineArtifact;
  configuration: Level;
  rules: PuzzleRules;
  gameHash: string;
  candidateHash: string;
};
export type CommunityProof = {
  candidateId: string;
  candidateHash: string;
  engineArtifactDigest: string;
  placement: Placement;
};
export type PublicationMetadata = {
  title: string;
  description: string;
  creatorNameSnapshot: string;
};
/** Deliberately independent of dated PuzzleResponse/CourseContext and competitive sessions. */
export type CommunityCourse = {
  versionId: string;
  levelId: string;
  number: number;
  metadata: PublicationMetadata;
  candidate: CanonicalCandidate;
};
