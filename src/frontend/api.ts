import type {
  CreateAttemptResponse,
  CreateSolutionResponse,
  TodayPuzzleResponse,
} from '../backend/types';
import { parseLevel } from '../game/levels/parse';
import type { CompletedRun } from './puzzle';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'The puzzle service is unavailable.');
  return body as T;
}

export async function loadDailyPuzzle(signal: AbortSignal): Promise<TodayPuzzleResponse> {
  const puzzle = await request<TodayPuzzleResponse>('/api/puzzles/today', {
    cache: 'no-store',
    signal,
  });
  return { ...puzzle, configuration: parseLevel(puzzle.configuration) };
}

/** Save only the locked layout captured when Play was pressed. */
export async function saveRun(puzzleId: string, run: CompletedRun): Promise<void> {
  const post = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const { attemptId } = await request<CreateAttemptResponse>(
    '/api/attempts',
    post({
      puzzleId,
      success: run.result.solved,
      simulationTime: run.result.seconds,
      forceCost: run.result.tiles,
      tileCount: run.result.tiles,
    }),
  );
  if (run.result.solved) {
    await request<CreateSolutionResponse>(
      '/api/solutions',
      post({
        puzzleId,
        attemptId,
        placementData: {
          levelId: run.level.id,
          levelVersion: run.level.version,
          commands: run.commands,
        },
      }),
    );
  }
}
