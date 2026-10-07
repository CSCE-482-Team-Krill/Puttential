/**
 * Typed errors thrown by backend services.
 *
 * Services stay independent of HTTP, but each error class carries the
 * status code that a Route Handler should send back. Any other error
 * (for example a lost database connection) becomes a 500.
 */

export class BackendError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = new.target.name;
        this.status = status;
    }
}

/** The request is malformed or breaks a rule (HTTP 400). */
export class ValidationError extends BackendError {
    constructor(message: string) {
        super(message, 400);
    }
}

/** A referenced puzzle, user, or attempt does not exist (HTTP 404). */
export class NotFoundError extends BackendError {
    constructor(message: string) {
        super(message, 404);
    }
}

/** The request conflicts with data already stored (HTTP 409). */
export class ConflictError extends BackendError {
    constructor(message: string) {
        super(message, 409);
    }
}