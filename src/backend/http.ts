import { BackendError, ValidationError } from "./errors";
import type { ApiErrorResponse } from "./types";

/**
 * Helpers shared by the Next.js Route Handlers.
 *
 * They use only the web-standard Request and Response classes (no
 * NextResponse), so the same code works on any host that supports the
 * Fetch API.
 */

/** Builds a JSON response with the given status code. */
export function jsonResponse<T>(data: T, status = 200): Response {
    return Response.json(data, { status });
}

/** Reads the request body as JSON, or throws a ValidationError (400). */
export async function readJsonBody(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        throw new ValidationError("Request body must be valid JSON.");
    }
}

/**
 * Prisma reports a unique-constraint violation with code P2002. This can
 * still happen after a service's own duplicate check if two requests for
 * the same attempt arrive at the same moment.
 */
function isUniqueConstraintError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
    );
}

/**
 * Turns any thrown error into an `{ error }` JSON response.
 *
 * Known backend errors keep their message and status. Unexpected errors
 * are logged on the server and return a generic 500, so database details
 * are never sent to the browser.
 */
export function errorResponse(error: unknown): Response {
    if (error instanceof BackendError) {
        return jsonResponse<ApiErrorResponse>({ error: error.message }, error.status);
    }

    if (isUniqueConstraintError(error)) {
        return jsonResponse<ApiErrorResponse>(
            { error: "This record already exists." },
            409
        );
    }

    console.error(error);
    return jsonResponse<ApiErrorResponse>({ error: "Internal server error." }, 500);
}