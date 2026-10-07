import { errorResponse, jsonResponse, readJsonBody } from "@backend/http";
import { createAttempt } from "@backend/services/attempt_service";
import type { CreateAttemptResponse } from "@backend/types";
import { parseCreateAttemptRequest } from "@backend/validation";

// Prisma and the pg driver need the Node.js runtime.
export const runtime = "nodejs";

/**
 * POST /api/attempts: records one simulation run.
 *
 * `success` and the metrics are reported by the client and are not
 * verified by the server yet.
 */
export async function POST(request: Request): Promise<Response> {
    try {
        const input = parseCreateAttemptRequest(await readJsonBody(request));
        const result = await createAttempt(input);
        return jsonResponse<CreateAttemptResponse>(result, 201);
    } catch (error) {
        return errorResponse(error);
    }
}