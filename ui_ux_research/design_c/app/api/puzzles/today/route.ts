import { NotFoundError } from "@backend/errors";
import { errorResponse, jsonResponse } from "@backend/http";
import { getTodaysPuzzle } from "@backend/services/puzzle_service";
import type { TodayPuzzleResponse } from "@backend/types";

// Prisma and the pg driver need the Node.js runtime.
export const runtime = "nodejs";

/** GET /api/puzzles/today: today's puzzle in U.S. Central Time. */
export async function GET(): Promise<Response> {
    try {
        const puzzle = await getTodaysPuzzle();
        if (!puzzle) {
            throw new NotFoundError("Today's puzzle was not found.");
        }
        return jsonResponse<TodayPuzzleResponse>(puzzle);
    } catch (error) {
        return errorResponse(error);
    }
}