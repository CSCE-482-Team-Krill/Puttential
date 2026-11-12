import type { GameCommand } from '../game/types';

/** Payloads for the legacy, unranked attempts and solutions API. */
export type CreateAttemptRequest = {
  puzzleId: string;
  userId?: string | null;

  success?: boolean;

  simulationTime?: number | null;
  forceCost?: number | null;
  tileCount?: number | null;
  pathLength?: number | null;
};

/**
 * Minimal response after successfully creating an attempt.
 *
 * The frontend can use attemptId later when saving a successful
 * solution.
 */
export type CreateAttemptResponse = {
  attemptId: string;
};

// ============================================================
// Physics / Replay Commands
// ============================================================

/**
 * API-friendly representation of the commands currently supported
 * by the game engine.
 *
 * The API and simulation use the same GameCommand definition.
 */
export type ReplayCommand = GameCommand;

/**
 * Information required to reconstruct a player's solution.
 *
 * Commands are stored instead of storing a video replay.
 * The level and simulation versions help ensure that a replay is
 * interpreted using the same game rules that originally produced it.
 */
export type SolutionPlacementData = {
  levelId: string;
  levelVersion: number;

  simulationVersion?: string;

  commands: ReplayCommand[];
};

// ============================================================
// Solution API
// ============================================================

/**
 * Data sent to the backend when a successful solution is saved.
 *
 * These compatibility endpoints retain the prototype payloads and
 * do not write to competitive standings.
 */
export type CreateSolutionRequest = {
  puzzleId: string;
  attemptId: string;

  userId?: string | null;

  placementData: SolutionPlacementData;
};

/**
 * Response returned after storing a solution.
 */
export type CreateSolutionResponse = {
  solutionId: string;
};
