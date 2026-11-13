import type { Level, LevelDocument } from '../game';
import type { Placement, PuzzleRules, PuzzleResponse } from './puzzle-contracts';

export type CommunityMapSummary = {
  id: string;
  title: string;
  description: string;
  creatorName: string;
  createdAt: string;
};
export type CommunityMapDetail = CommunityMapSummary & {
  configuration: Level;
  rules: PuzzleRules;
  competition: PuzzleResponse;
};
export type CommunityMapList = { items: CommunityMapSummary[]; nextCursor: string | null };
export type PublishCommunityMap = {
  requestId: string;
  expectedGuestId: string;
  title: string;
  description: string;
  document: LevelDocument;
  placement: Placement;
};
export const communityMapUrl = (id: string) => `/?community=${encodeURIComponent(id)}`;
