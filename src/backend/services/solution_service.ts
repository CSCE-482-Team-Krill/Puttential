import { Prisma } from "../../../generated/prisma/client";

import { prisma } from "../prisma";
import type { CreateSolutionRequest, CreateSolutionResponse,} from "../types";

/**
 * Performs basic structural validation for replay/placement data.
 *
 * This is NOT the final physics validation.
 *
 * The goal here is only to reject obviously malformed data before it
 * is stored in PostgreSQL. Later, the shared physics engine will be
 * used to verify whether the submitted commands actually solve the
 * puzzle.
 */
function validatePlacementData(placementData: CreateSolutionRequest["placementData"]): void {
    if (!placementData.levelId || placementData.levelId.trim().length === 0) {
        throw new Error("placementData.levelId is required.");
    }

    if (
        !Number.isSafeInteger(placementData.levelVersion) ||
        placementData.levelVersion < 0
    ) {
        throw new Error(
        "placementData.levelVersion must be a non-negative integer."
        );
    }

    if (!Array.isArray(placementData.commands)) {
        throw new Error("placementData.commands must be an array.");
    }

    /**
     * Command sequence numbers must be unique.
     *
     * The current game engine processes queued commands in ascending
     * sequence order, so duplicate sequence numbers would make a replay
     * invalid or ambiguous.
     */
    const sequences = new Set<number>();

    for (const command of placementData.commands) {
        if (!command.fieldId || command.fieldId.trim().length === 0) {
        throw new Error("Every replay command must include a fieldId.");
        }

        if (!Number.isSafeInteger(command.sequence) || command.sequence < 0) {
        throw new Error(
            "Replay command sequence must be a non-negative integer."
        );
        }

        if (sequences.has(command.sequence)) {
        throw new Error(
            `Duplicate replay command sequence: ${command.sequence}`
        );
        }

        sequences.add(command.sequence);

        /**
         * move-field commands use quantized integer coordinates.
         *
         * This mirrors the current game engine, where xQ and yQ represent
         * positions on the engine's quantized coordinate grid.
         */
        if (command.type === "move-field") {
        if (
            !Number.isSafeInteger(command.xQ) ||
            !Number.isSafeInteger(command.yQ)
        ) {
            throw new Error(
            "move-field xQ and yQ must be safe integers."
            );
        }
        }
    }
}

/**
 * Stores a successful player's solution.
 *
 * A Solution must reference an existing Attempt, and that Attempt must
 * already be marked as successful.
 *
 * The actual replay commands are stored in placementData so they can
 * later be used for:
 *
 * - replaying the solution;
 * - server-side physics validation;
 * - comparing or analyzing player solutions.
 */
export async function createSolution(input: CreateSolutionRequest): Promise<CreateSolutionResponse> {
    // Basic ID validation before querying the database.
    if (!input.puzzleId || input.puzzleId.trim().length === 0) {
        throw new Error("puzzleId is required.");
    }

    if (!input.attemptId || input.attemptId.trim().length === 0) {
        throw new Error("attemptId is required.");
    }

    // Reject clearly malformed replay data before storing it.
    validatePlacementData(input.placementData);

    /**
     * Load the referenced Attempt.
     *
     * We also load its existing Solution relationship because our schema
     * allows at most one Solution per Attempt.
     */
    const attempt = await prisma.attempt.findUnique({
        where: {
        id: input.attemptId,
        },

        select: {
        id: true,
        puzzleId: true,
        userId: true,
        success: true,

        solution: {
            select: {
            id: true,
            },
        },
        },
    });

    if (!attempt) {
        throw new Error(`Attempt not found: ${input.attemptId}`);
    }

    /**
     * The Attempt and Solution must belong to the same Puzzle.
     *
     * This prevents a client from submitting an Attempt from one puzzle
     * while attaching it to another puzzle's Solution.
     */
    if (attempt.puzzleId !== input.puzzleId) {
        throw new Error(
        "The attempt does not belong to the specified puzzle."
        );
    }

    /**
     * For the current prototype, Attempt.success is still supplied by
     * the caller/game layer.
     *
     * Later, server-side physics validation should determine success
     * independently before a Solution is accepted.
     */
    if (!attempt.success) {
        throw new Error(
        "A solution cannot be created from an unsuccessful attempt."
        );
    }

    /**
     * Our Prisma schema defines attemptId as unique in Solution, so one
     * Attempt can have at most one Solution.
     *
     * We check it here explicitly to provide a clearer backend error
     * instead of relying only on the database uniqueness constraint.
     */
    if (attempt.solution) {
        throw new Error(
        `A solution already exists for attempt ${input.attemptId}.`
        );
    }

    /**
     * userId is already associated with the Attempt.
     *
     * If the caller supplies a userId, make sure it matches the Attempt.
     * Anonymous attempts naturally have userId = null.
     */
    if (
        input.userId !== undefined &&
        input.userId !== attempt.userId
    ) {
        throw new Error(
        "The solution user does not match the attempt user."
        );
    }

    /**
     * Store the solution.
     *
     * We use the Attempt's userId as the authoritative value instead of
     * trusting the client to repeat it correctly.
     *
     * placementData is stored in PostgreSQL as JSON/JSONB.
     */
    const solution = await prisma.solution.create({
        data: {
        puzzleId: input.puzzleId,
        attemptId: input.attemptId,
        userId: attempt.userId,

        placementData:
            input.placementData as Prisma.InputJsonValue,
        },

        select: {
        id: true,
        },
    });

    return {
        solutionId: solution.id,
    };
}