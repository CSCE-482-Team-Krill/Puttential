import type { Bounds, GameCommand, Level } from '../game';

/** Revision 3.1 transport consumed by the browser and verified daily API. */
export const CONTRACT_REVISION = '3.1';
export const LIMITS = {
  fields: 256,
  commands: 768,
  bodyBytes: 256 * 1024,
  maxTicks: 7200,
  maxCost: 1_000_000,
  pageSize: 50,
  nicknameMin: 3,
  nicknameMax: 24,
} as const;
export type SetupCommand = GameCommand;
export type Player = { id: string; nickname: string };
export type Metrics = {
  forceCost: number;
  tileCount: number;
  completionTick: number;
  pathLengthQ: number;
};
export type PuzzleRules = {
  rulesVersion: string;
  simulationVersion: string;
  maxTicks: number;
  placementBounds: Bounds;
  tileCosts: Record<string, number>;
  rotationAllowed: boolean;
};
export type PuzzleAvailability = {
  puzzleId: string;
  revision: string;
  publicationStatus: 'active' | 'canceled';
  canceledAt: string | null;
  cancellationMessage: string | null;
};
export type PuzzleResponse = {
  id: string;
  date: string;
  title: string;
  seed: string;
  difficulty: number;
  configuration: Level;
  rules: PuzzleRules;
  availability: PuzzleAvailability;
  serverNow: string;
  todayDate: string;
  nextDailyAt: string;
};
export type Placement = {
  levelId: string;
  levelVersion: number;
  rulesVersion: string;
  simulationVersion: string;
  commands: SetupCommand[];
};
export type SavedResult = {
  runId: string;
  outcome:
    | 'success'
    | 'stopped'
    | 'water'
    | 'lava'
    | 'out-of-bounds'
    | 'timeout'
    | 'aborted'
    | 'interrupted';
  verification: 'verified' | 'not-applicable';
  metrics: Metrics | null;
  dailyEligible: boolean;
  savedAt: string;
};
export type PuzzleProgress = {
  guestId: string;
  puzzleId: string;
  revision: string;
  attemptsStarted: number;
  firstSolveAttempts: number | null;
  bestDaily: SavedResult | null;
  bestArchive: SavedResult | null;
};
export type ProgressResponse = { progress: PuzzleProgress; availability: PuzzleAvailability };
export type StartRunRequest = {
  expectedGuestId: string;
  requestId: string;
  puzzleId: string;
  placement: Placement;
};
export type CompleteRunRequest = { expectedGuestId: string } & (
  { kind: 'terminal' } | { kind: 'aborted' | 'interrupted'; observedTick: number }
);
type Completion = { intent: CompleteRunRequest; receivedAt: string; dailyEligible: boolean };
type RunBase = {
  guestId: string;
  runId: string;
  requestId: string;
  puzzleId: string;
  attemptOrdinal: number;
  startedAt: string;
  runRevision: string;
  availability: PuzzleAvailability;
  progress: PuzzleProgress;
};
export type RunResponse = RunBase &
  (
    | { state: 'accepted'; completion: null }
    | {
        state: 'processing';
        completion: Completion;
        verification: {
          status: 'queued' | 'running' | 'retry-wait' | 'blocked';
          issue: { code: string; message: string } | null;
        };
        retryAfterMs: number;
      }
    | { state: 'saved'; completion: Completion; result: SavedResult }
    | {
        state: 'rejected';
        completion: Completion;
        rejection: {
          code: 'INVALID_SETUP' | 'INVALID_REPLAY';
          message: string;
        };
      }
    | {
        state: 'canceled';
        cancellation: { code: 'PUZZLE_CANCELED'; canceledAt: string; message: string };
      }
  );
export type Scope = 'daily' | 'archive';
export type ReplayAccess = { available: boolean; unlocksAt: string };
export type ReplayResponse = {
  viewerGuestId: string;
  puzzleId: string;
  scope: Scope;
  player: Player;
  placement: Placement;
  result: SavedResult;
  availability: PuzzleAvailability;
};
export type BoardView = 'top' | 'around-me';
export type LeaderboardRow = {
  rank: number;
  player: Player;
  metrics: Metrics;
  firstSolveAttempts: number;
  percentile: number;
};
export type LeaderboardResponse = {
  viewerGuestId: string;
  puzzleId: string;
  scope: Scope;
  view: BoardView;
  availability: PuzzleAvailability;
  boardRevision: string;
  rows: LeaderboardRow[];
  me: (LeaderboardRow & { bestRunId: string }) | null;
  totalPlayers: number;
  nextCursor: string | null;
  asOf: string;
  replayAccess: ReplayAccess;
  submissionClosed: boolean;
  pendingEligibleCount: number;
  final: boolean;
};
export type ArchiveItem = {
  id: string;
  date: string;
  title: string;
  difficulty: number;
  status: 'unplayed' | 'attempted' | 'solved';
  progressRevision: string;
  availability: PuzzleAvailability;
};
export type ArchiveResponse = { guestId: string; items: ArchiveItem[]; nextCursor: string | null };
