import { BackendError } from './errors';
import type { CreateAttemptRequest, CreateSolutionRequest, SolutionPlacementData } from './types';

/** A malformed request rejected before any service runs. */
export class HttpError extends BackendError {
  constructor(status: number, message: string) {
    super(message, status);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

function id(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${name} is required.`);
  }
  return value;
}

function anonymous(body: Record<string, unknown>) {
  if (body.userId != null) throw new HttpError(400, 'Only anonymous submissions are supported.');
}

export function parseAttempt(value: unknown): CreateAttemptRequest {
  const body = object(value);
  anonymous(body);
  const input: CreateAttemptRequest = { puzzleId: id(body.puzzleId, 'puzzleId') };
  if (body.success !== undefined) {
    if (typeof body.success !== 'boolean') throw new HttpError(400, 'success must be a boolean.');
    input.success = body.success;
  }
  for (const key of ['simulationTime', 'forceCost', 'tileCount', 'pathLength'] as const) {
    const metric = body[key];
    if (metric == null) continue;
    if (
      typeof metric !== 'number' ||
      !Number.isFinite(metric) ||
      metric < 0 ||
      ((key === 'forceCost' || key === 'tileCount') &&
        (!Number.isSafeInteger(metric) || metric > 2147483647))
    ) {
      throw new HttpError(
        400,
        `${key} must be a non-negative ${key === 'forceCost' || key === 'tileCount' ? '32-bit integer' : 'finite number'}.`,
      );
    }
    input[key] = metric;
  }
  return input;
}

export function parseSolution(value: unknown): CreateSolutionRequest {
  const body = object(value);
  anonymous(body);
  const placement = object(body.placementData);
  if (!Number.isSafeInteger(placement.levelVersion) || (placement.levelVersion as number) < 0) {
    throw new HttpError(400, 'levelVersion must be a non-negative integer.');
  }
  if (!Array.isArray(placement.commands)) throw new HttpError(400, 'commands must be an array.');
  const sequences = new Set<number>();
  const commands = placement.commands.map((value: unknown) => {
    const command = object(value);
    const fieldId = id(command.fieldId, 'fieldId');
    const sequence = command.sequence as number;
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequences.has(sequence)) {
      throw new HttpError(400, 'Command sequences must be unique non-negative integers.');
    }
    sequences.add(sequence);
    if (
      command.type === 'move-field' &&
      Number.isSafeInteger(command.xQ) &&
      Number.isSafeInteger(command.yQ)
    ) {
      return {
        type: 'move-field' as const,
        fieldId,
        sequence,
        xQ: command.xQ as number,
        yQ: command.yQ as number,
      };
    }
    if (command.type === 'set-field-enabled' && typeof command.enabled === 'boolean') {
      return { type: 'set-field-enabled' as const, fieldId, sequence, enabled: command.enabled };
    }
    throw new HttpError(400, 'Invalid replay command.');
  });
  const placementData: SolutionPlacementData = {
    levelId: id(placement.levelId, 'levelId'),
    levelVersion: placement.levelVersion as number,
    commands,
  };
  // Optional: records which engine build produced the replay, for later validation.
  if (placement.simulationVersion !== undefined) {
    const version = placement.simulationVersion;
    if (typeof version !== 'string' || !version.trim() || version.length > 200) {
      throw new HttpError(
        400,
        'simulationVersion must be a non-empty string of at most 200 characters.',
      );
    }
    placementData.simulationVersion = version;
  }
  return {
    puzzleId: id(body.puzzleId, 'puzzleId'),
    attemptId: id(body.attemptId, 'attemptId'),
    placementData,
  };
}

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

/**
 * Prisma reports a unique-constraint violation as P2002. This can still happen
 * after a service's own duplicate check when two identical requests race.
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function apiError(error: unknown): Response {
  // Services and request parsing throw typed errors that carry their HTTP status.
  if (error instanceof BackendError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (isUniqueConstraintError(error)) {
    return Response.json({ error: 'This record already exists.' }, { status: 409 });
  }
  console.error('Puzzle API request failed:', error);
  return Response.json(
    { error: 'The puzzle service is unavailable. Please try again later.' },
    { status: 503 },
  );
}
