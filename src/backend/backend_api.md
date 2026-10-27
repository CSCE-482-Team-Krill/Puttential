# Daily competitive API

Next.js serves all routes on the game origin with private, no-store responses. The runtime contract and validators live in `src/shared/puzzle-contracts.ts` and `src/shared/response-validation.ts`. Responses never include author solutions or player placement commands.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /api/puzzles/today | Published Central-date course, immutable rules, availability and next midnight |
| GET | /api/puzzles/by-date/YYYY-MM-DD | Published historical/current course; future dates are hidden |
| POST | /api/guest | Reuse or create an opaque HttpOnly guest session |
| GET / PATCH | /api/me | Read guest / update nickname with expectedGuestId |
| GET | /api/me/progress?puzzleId=... | Persisted starts, frozen first solve, best daily/archive and revisions |
| POST | /api/runs | Idempotent counted start with expected guest, UUID request ID and canonical Placement |
| GET | /api/runs/by-request/requestId | Recover the current guest's ambiguous start |
| GET | /api/runs/runId | Read owned lifecycle and current availability; recover expired verification leases |
| POST | /api/runs/runId/complete | Persist one immutable completion receipt, then perform server replay |
| GET | /api/puzzles?month=YYYY-MM&limit=20&cursor=... | Nonfuture archive summaries with current guest progress |
| GET | /api/puzzles/puzzleId/leaderboard?scope=daily&view=top | Verified standings, ties, percentile, me and finality |

Leaderboard scope is `daily` or `archive`; view is `top` or `around-me`. Pagination accepts 1?50 rows and signed cursors bound to guest, puzzle, scope, view and board revision. An invalidated board returns 409 BOARD_REVISION_CHANGED; a different viewer returns 409 LEADERBOARD_VIEWER_CHANGED.

All guest-owned mutations include `expectedGuestId`, but ownership comes exclusively from the cookie. The server checks the configured exact origin; a submitted public guest ID cannot authenticate a write. Complete uses `{ expectedGuestId, kind: 'terminal' }` or an aborted/interrupted intent with a bounded observedTick. Claimed client success and score do not control replay.

Start and completion retries reuse their original identities and bodies. A conflicting reused request or completion returns 409. Starts commit an attempt ordinal before acknowledgment. Completion receipts capture database time before replay, so a lost response or crashed worker cannot change daily qualification. Best results, first-solve ordinal and terminal result save atomically.

Errors are `{ error, code, retryable }`, with 400/413/415 for malformed requests, 401 for missing guest, 403 for origin rejection, 404 for missing/unowned/future data, 409 for identity/content conflicts, 410 for canceled courses, 429 for admission limits and 503 for infrastructure unavailability. Retry-After accompanies 429/503.

The compatibility `POST /api/attempts` and `POST /api/solutions` routes retain their prototype payloads and write only legacy, unranked tables. They cannot populate competitive progress or standings. Do not use them for the daily frontend.

See [release and publishing](../../docs/iteration-two-release.md) for database setup, supported versions, capacity, worker recovery, cancellation and acceptance.
