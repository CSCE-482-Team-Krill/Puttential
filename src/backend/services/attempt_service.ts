import { prisma } from "../prisma";
import type {CreateAttemptRequest, CreateAttemptResponse,} from "../types";

/**
 * Checks whether an optional numeric metric is valid.
 *
 * Attempt metrics such as simulation time, force cost, tile count,
 * and path length should never be negative or non-finite.
 */
function validateOptionalNonNegativeNumber( value: number | null | undefined, fieldName: string): void {
    if (value === null || value === undefined) {
        return;
    }

    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative finite number.`);
    }
}

/**
 * Checks whether an optional metric is a non-negative integer.
 *
 * forceCost and tileCount represent discrete values, so decimal
 * numbers are not valid for these fields.
 */
function validateOptionalNonNegativeInteger(value: number | null | undefined,fieldName: string): void {
    if (value === null || value === undefined) {
        return;
    }

    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative integer.`);
    }
}

/**
 * Creates one gameplay attempt in the database.
 *
 * An attempt represents one simulation run started by the player.
 * Anonymous attempts are supported by allowing userId to be null.
 *
 * Some scoring metrics are optional because the current game engine
 * does not yet calculate every final scoring value.
 */
export async function createAttempt(input: CreateAttemptRequest): Promise<CreateAttemptResponse> {
  // A puzzle is required for every attempt.
    if (!input.puzzleId || input.puzzleId.trim().length === 0) {
        throw new Error("puzzleId is required.");
    }

    // Validate optional physics/scoring metrics before sending them
    // to the database.
    validateOptionalNonNegativeNumber(
        input.simulationTime,
        "simulationTime"
    );

    validateOptionalNonNegativeInteger(
        input.forceCost,
        "forceCost"
    );

    validateOptionalNonNegativeInteger(
        input.tileCount,
        "tileCount"
    );

    validateOptionalNonNegativeNumber(
        input.pathLength,
        "pathLength"
    );

    /**
     * Confirm that the referenced puzzle actually exists.
     *
     * PostgreSQL would eventually reject an invalid foreign key anyway,
     * but checking here gives the backend a clearer and more intentional
     * error.
     */
    const puzzle = await prisma.puzzle.findUnique({
        where: {
        id: input.puzzleId,
        },
        select: {
        id: true,
        },
    });

    if (!puzzle) {
        throw new Error(`Puzzle not found: ${input.puzzleId}`);
    }

    /**
     * userId is optional because anonymous gameplay is allowed.
     *
     * If a userId is supplied, verify that the user exists before
     * creating the attempt.
     */
    if (input.userId) {
        const user = await prisma.user.findUnique({
        where: {
            id: input.userId,
        },
        select: {
            id: true,
        },
        });

        if (!user) {
        throw new Error(`User not found: ${input.userId}`);
        }
    }

    /**
     * Create the Attempt record.
     *
     * For the current prototype, `success` is supplied by the caller.
     * Later, once the game engine exposes a formal win condition,
     * server-side physics validation should verify this value instead
     * of trusting the client directly.
     */
    const attempt = await prisma.attempt.create({
        data: {
        puzzleId: input.puzzleId,
        userId: input.userId ?? null,

        success: input.success ?? false,

        simulationTime: input.simulationTime ?? null,
        forceCost: input.forceCost ?? null,
        tileCount: input.tileCount ?? null,
        pathLength: input.pathLength ?? null,
        },

        // The frontend only needs the new attempt ID at this stage.
        select: {
        id: true,
        },
    });

    return {
        attemptId: attempt.id,
    };
}