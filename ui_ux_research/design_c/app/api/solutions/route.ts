import { errorResponse, jsonResponse, readJsonBody } from "@backend/http";
import { createSolution } from "@backend/services/solution_service";
import type { CreateSolutionResponse } from "@backend/types";
import { parseCreateSolutionRequest } from "@backend/validation";

// Prisma and the pg driver need the Node.js runtime.
export const runtime = "nodejs";

/**
 * POST /api/solutions: stores replay data for a successful attempt.
 *
 * The commands are checked for structure only. The server does not
 * replay them through the physics engine yet.
 */
export async function POST(request: Request): Promise<Response> {
    try {
        const input = parseCreateSolutionRequest(await readJsonBody(request));
        const result = await createSolution(input);
        return jsonResponse<CreateSolutionResponse>(result, 201);
    } catch (error) {
        return errorResponse(error);
    }
}