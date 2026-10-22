# Puttential prototype API

The Next.js app in `src/frontend` serves these same-origin endpoints on port 3000. Route handlers call services in `src/backend/services`; Prisma uses PostgreSQL through the root `DATABASE_URL`. See the [full-stack setup guide](../../README.md).

## GET /api/puzzles/today

Returns `{ id, date, seed, difficulty, configuration }`. The date is `YYYY-MM-DD` in `America/Chicago`; `configuration` is a canonical engine `Level`, parsed with the shared codec before it is returned. Responses are dynamic and are not cached. A missing dated puzzle returns 404. Run `npm run db:seed` to provision today.

## POST /api/attempts

Accepts JSON:

```json
{
  "puzzleId": "database-puzzle-id",
  "success": true,
  "simulationTime": 4.82,
  "forceCost": 2,
  "tileCount": 2,
  "pathLength": 7.4
}
```

Returns status 201 with `{ "attemptId": "..." }`. `puzzleId` is required. Metrics are optional and must be finite and non-negative; force cost and tile count must be 32-bit integers. The frontend submits completed runs, including failures; interrupted runs are not submitted. Path length is not currently measured by the frontend.

## POST /api/solutions

Accepts JSON:

```json
{
  "puzzleId": "database-puzzle-id",
  "attemptId": "successful-attempt-id",
  "placementData": {
    "levelId": "bar-around-corner",
    "levelVersion": 4,
    "simulationVersion": "puttential-core-1",
    "commands": [
      { "type": "move-field", "fieldId": "push-field", "xQ": 0, "yQ": 0, "sequence": 0 },
      { "type": "set-field-enabled", "fieldId": "push-field", "enabled": true, "sequence": 1 }
    ]
  }
}
```

Returns status 201 with `{ "solutionId": "..." }`. Replay commands use the engine's `GameCommand` type and quantized integer coordinates. Sequence numbers must be unique non-negative integers. `simulationVersion` is optional; when present it must be a non-empty string of at most 200 characters, and it is stored with the replay for future server-side validation. The attempt must exist, belong to the same puzzle, be successful and have no existing solution.

## Errors and prototype limits

Errors use `{ "error": "Human-readable message" }`.

- 400: malformed JSON, invalid types/metrics/commands, unsupported identity or incompatible attempt.
- 404: puzzle or attempt not found.
- 409: the attempt already has a solution, including when two identical submissions race (database unique constraint).
- 503: database or internal service unavailable; internal error details stay on the server.
Services throw typed errors from `src/backend/errors.ts` (`ValidationError`, `NotFoundError`, `ConflictError`), and `apiError` in `src/backend/http.ts` maps each type to its status. Status codes never depend on error message text, so messages can be reworded safely.

HTTP writes currently support anonymous play only (`userId` omitted or null). Profile, streak and leaderboard data remain samples; historical database browsing and accounts have no HTTP API yet. Success and scores are still client-reported. Server-side replay verification, rankings, interrupted-run tracking and durable submission retries are not implemented.
