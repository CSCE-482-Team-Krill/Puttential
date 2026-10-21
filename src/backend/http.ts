import type { CreateAttemptRequest, CreateSolutionRequest } from './types';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
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
  return {
    puzzleId: id(body.puzzleId, 'puzzleId'),
    attemptId: id(body.attemptId, 'attemptId'),
    placementData: {
      levelId: id(placement.levelId, 'levelId'),
      levelVersion: placement.levelVersion as number,
      commands,
    },
  };
}

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  // The existing service layer uses ordinary Errors for domain failures.
  if (error instanceof Error) {
    if (/^(Puzzle|User|Attempt) not found:/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (/^A solution already exists/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (
      /^(The attempt does not belong|A solution cannot be created|The solution user does not match)/.test(
        error.message,
      )
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
  }
  console.error('Puzzle API request failed:', error);
  return Response.json(
    { error: 'The puzzle service is unavailable. Please try again later.' },
    { status: 503 },
  );
}
