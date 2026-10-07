import { ValidationError } from "./errors";
import type {
    CreateAttemptRequest,
    CreateSolutionRequest,
    ReplayCommand,
    SolutionPlacementData,
} from "./types";

/**
 * Runtime checks for request bodies.
 *
 * TypeScript types disappear at runtime, so JSON sent by a browser can
 * contain anything. These functions turn `unknown` JSON into the typed
 * request objects the services expect, or throw a ValidationError (400).
 *
 * They only check shape and types. Business rules (does the puzzle exist,
 * are metrics non-negative, ...) stay in the services.
 */

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
    if (!isObject(value)) {
        throw new ValidationError(`${label} must be a JSON object.`);
    }
    return value;
}

function requireString(object: JsonObject, key: string, label = key): string {
    const value = object[key];
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ValidationError(`${label} must be a non-empty string.`);
    }
    return value;
}

function optionalNullableString(object: JsonObject, key: string): string | null | undefined {
    const value = object[key];
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ValidationError(`${key} must be a non-empty string or null.`);
    }
    return value;
}

function optionalBoolean(object: JsonObject, key: string): boolean | undefined {
    const value = object[key];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "boolean") {
        throw new ValidationError(`${key} must be a boolean.`);
    }
    return value;
}

function optionalNullableNumber(object: JsonObject, key: string): number | null | undefined {
    const value = object[key];
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== "number") {
        throw new ValidationError(`${key} must be a number or null.`);
    }
    return value;
}

function requireNumber(object: JsonObject, key: string, label: string): number {
    const value = object[key];
    if (typeof value !== "number") {
        throw new ValidationError(`${label} must be a number.`);
    }
    return value;
}

// ============================================================
// POST /api/attempts
// ============================================================

export function parseCreateAttemptRequest(body: unknown): CreateAttemptRequest {
    const object = requireObject(body, "Request body");

    const request: CreateAttemptRequest = {
        puzzleId: requireString(object, "puzzleId"),
    };

    // Only copy fields that were actually sent, so optional properties are
    // left out instead of being set to `undefined`.
    const userId = optionalNullableString(object, "userId");
    if (userId !== undefined) request.userId = userId;

    const success = optionalBoolean(object, "success");
    if (success !== undefined) request.success = success;

    const simulationTime = optionalNullableNumber(object, "simulationTime");
    if (simulationTime !== undefined) request.simulationTime = simulationTime;

    const forceCost = optionalNullableNumber(object, "forceCost");
    if (forceCost !== undefined) request.forceCost = forceCost;

    const tileCount = optionalNullableNumber(object, "tileCount");
    if (tileCount !== undefined) request.tileCount = tileCount;

    const pathLength = optionalNullableNumber(object, "pathLength");
    if (pathLength !== undefined) request.pathLength = pathLength;

    return request;
}

// ============================================================
// POST /api/solutions
// ============================================================

function parseReplayCommand(value: unknown, index: number): ReplayCommand {
    const label = `placementData.commands[${index}]`;
    const object = requireObject(value, label);

    const fieldId = requireString(object, "fieldId", `${label}.fieldId`);
    const sequence = requireNumber(object, "sequence", `${label}.sequence`);

    switch (object.type) {
        case "move-field":
            return {
                type: "move-field",
                fieldId,
                xQ: requireNumber(object, "xQ", `${label}.xQ`),
                yQ: requireNumber(object, "yQ", `${label}.yQ`),
                sequence,
            };

        case "set-field-enabled": {
            const enabled = object.enabled;
            if (typeof enabled !== "boolean") {
                throw new ValidationError(`${label}.enabled must be a boolean.`);
            }
            return { type: "set-field-enabled", fieldId, enabled, sequence };
        }

        default:
            throw new ValidationError(
                `${label}.type must be "move-field" or "set-field-enabled".`
            );
    }
}

function parsePlacementData(value: unknown): SolutionPlacementData {
    const object = requireObject(value, "placementData");

    const commands = object.commands;
    if (!Array.isArray(commands)) {
        throw new ValidationError("placementData.commands must be an array.");
    }

    const placementData: SolutionPlacementData = {
        levelId: requireString(object, "levelId", "placementData.levelId"),
        levelVersion: requireNumber(object, "levelVersion", "placementData.levelVersion"),
        commands: commands.map(parseReplayCommand),
    };

    const simulationVersion = object.simulationVersion;
    if (simulationVersion !== undefined) {
        if (typeof simulationVersion !== "string" || simulationVersion.trim().length === 0) {
            throw new ValidationError(
                "placementData.simulationVersion must be a non-empty string."
            );
        }
        placementData.simulationVersion = simulationVersion;
    }

    return placementData;
}

export function parseCreateSolutionRequest(body: unknown): CreateSolutionRequest {
    const object = requireObject(body, "Request body");

    const request: CreateSolutionRequest = {
        puzzleId: requireString(object, "puzzleId"),
        attemptId: requireString(object, "attemptId"),
        placementData: parsePlacementData(object.placementData),
    };

    const userId = optionalNullableString(object, "userId");
    if (userId !== undefined) request.userId = userId;

    return request;
}