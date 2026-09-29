import type { DemoResult, DemoUser, LeaderboardEntry, Placement, PuzzleDefinition, RunSnapshot, ValidationResult } from "./types";

export interface GameDataPort {
  getToday(): Promise<PuzzleDefinition>;
  getPuzzle(id: string): Promise<PuzzleDefinition | undefined>;
  getArchive(): Promise<PuzzleDefinition[]>;
  getLeaderboard(puzzleId: string, user: DemoUser | null, ownResult?: DemoResult): Promise<LeaderboardEntry[]>;
  validate(puzzle: PuzzleDefinition, placements: Placement[], reject?: boolean): Promise<ValidationResult>;
  getPlayback(puzzle: PuzzleDefinition, viewerSolved: boolean, userId: string): Promise<Placement[]>;
}
export interface AuthPort {
  signIn(method: string, name: string): Promise<DemoUser>;
  signOut(): Promise<void>;
}
export interface SimulationPort {
  start(onSnapshot: (snapshot: RunSnapshot) => void, onSuccess: () => void): void;
  pause(): void;
  resume(): void;
  setRate(rate: 0.5 | 1 | 2): void;
  abort(): void;
}
