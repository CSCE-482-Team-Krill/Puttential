import { prisma } from "../prisma";
import type { TodayPuzzleResponse } from "../types";

/**
 * Puttential daily puzzles use U.S. Central Time.
 *
 * Using the IANA timezone "America/Chicago" automatically handles
 * both CST (UTC-6) and CDT (UTC-5) during daylight saving time.
 */
const PUZZLE_TIME_ZONE = "America/Chicago";

/**
 * Converts a Date into a YYYY-MM-DD calendar date in U.S. Central Time.
 *
 * Example:
 * If the server runs in UTC or another timezone, this still returns
 * the date that players in the Central Time zone currently see.
 */
function getCentralDateString(date: Date): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: PUZZLE_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
        throw new Error("Unable to determine Central Time calendar date.");
    }

    return `${year}-${month}-${day}`;
}

/**
 * Converts a YYYY-MM-DD string into the Date representation used by
 * Prisma for our PostgreSQL DATE column.
 */
function databaseDate(dateString: string): Date {
    return new Date(`${dateString}T00:00:00.000Z`);
}

/**
 * Finds the canonical puzzle for a specific calendar date.
 * 
 * The service returns a backend/API DTO instead of exposing
 * the raw Prisma database record directly.
 */
export async function getPuzzleByDate(date: Date): Promise<TodayPuzzleResponse | null> {
    const centralDate = getCentralDateString(date);

    const puzzle = await prisma.puzzle.findUnique({
        where: {
        date: databaseDate(centralDate),
        },
        // Only select fields that the frontend needs for the daily puzzle.
        select: {
        id: true,
        date: true,
        seed: true,
        difficulty: true,
        configuration: true,
        },
    });

    if (!puzzle) {
        return null;
    }

    // Convert the Prisma/database object into our API response format.
    return {
        id: puzzle.id,
        date: centralDate,
        seed: puzzle.seed,
        difficulty: puzzle.difficulty,
        configuration: puzzle.configuration,
    };
}

/**
 * Returns today's puzzle according to U.S. Central Time.
 *
 * This will eventually be used by:
 *
 * GET /api/puzzles/today
 * 
 * Route Handler.
 */
export async function getTodaysPuzzle(): Promise<TodayPuzzleResponse | null> {
    return getPuzzleByDate(new Date());
}