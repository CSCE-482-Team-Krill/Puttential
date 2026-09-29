/**
 * Shared backend data types.
 *
 * These types describe the data exchanged between the frontend,
 * backend services, and eventually the shared physics engine.
 *
 * They are intentionally independent of any specific UI design
 * (design_a, design_b, or design_c).
 */


// ============================================================
// Puzzle API
// ============================================================

/**
 * Data returned to the frontend for the daily puzzle.
 *
 * `configuration` will eventually contain the Level object used by
 * the shared game engine. It is left as `unknown` for now because
 * the game-engine branch has not yet been merged into the main app.
 *
 * Once the game engine is integrated, this can be changed to:
 *
 *   configuration: Level
 */
export type TodayPuzzleResponse = {
    id: string;
    date: string;
    seed: string;
    difficulty: number;
    configuration: unknown;
};


// ============================================================
// Attempt API
// ============================================================

/**
 * Data sent when a player completes one simulation attempt.
 *
 * userId is optional because Puttential allows anonymous play.
 *
 * Some physics metrics are optional for now because the current
 * game engine does not yet calculate every scoring metric.
 */
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
 * These definitions mirror the current GameCommand type from:
 *
 *   src/game/types.ts
 *
 * When the game-engine branch is merged, we should ideally import
 * GameCommand directly instead of maintaining duplicate definitions.
 */
export type ReplayCommand =
  | {
      type: "move-field";
      fieldId: string;
      xQ: number;
      yQ: number;
      sequence: number;
    }
  | {
      type: "set-field-enabled";
      fieldId: string;
      enabled: boolean;
      sequence: number;
    };


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
 * Server-side physics validation is not implemented yet because
 * the current game engine does not expose a formal win/success rule.
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


// ============================================================
// Future Physics Validation
// ============================================================

/**
 * Input for future server-side solution validation.
 *
 * The backend will eventually recreate the puzzle simulation using
 * the shared physics engine and verify that the submitted commands
 * actually produce a successful result.
 */
export type SolutionValidationInput = {
    puzzleId: string;
    placementData: SolutionPlacementData;
};

/**
 * Result returned by the future physics validator.
 *
 * This interface can already be used by backend code even though
 * the actual validator has not been implemented yet.
 */
export type SolutionValidationResult = {
    valid: boolean;
    reason?: string;
};


// ============================================================
// Common API Error
// ============================================================

/**
 * Standard error shape that our Next.js Route Handlers can return.
 */
export type ApiErrorResponse = {
    error: string;
};