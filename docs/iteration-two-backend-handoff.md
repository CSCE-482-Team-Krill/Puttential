# Puttential: backend handoff and iteration 2 end goals

Prepared: October 26, 2026. Share this entire file with the backend team. It contains the frontend workstream, whole-project completion goals, backend tasks, proposed product rules and API contracts. Section/task numbers match the [full implementation plan](iteration-two-implementation-plan.md). This is a planning handoff; feature implementation status must be confirmed with each owner.

## 7. Copy-paste backend team handoff

> Backend team: our shared iteration 2 goal is a working daily game: a guest opens the dated course, arranges limited force tiles, runs a locked simulation, saves a verified result, compares it on a global leaderboard, copies a spoiler-free result, and can return to play historical courses. Please implement B0-B7 below. The frontend workstream and the milestone's joint acceptance criteria are included here so backend priorities can be coordinated with actual user flows.

### Frontend status and workstream

Status note: this is the frontend implementation assignment for iteration 2, not a claim that every item is already in progress or complete. As of this planning handoff, we have produced the plan; no feature implementation has been performed in this planning session. Check the current frontend revision with its owner when scheduling integration.

The existing frontend already has the responsive game layout, shared Rapier playback, force toggles/dragging, retry/reset, modal shells, practice/local-course selection and basic daily-load/completed-run save calls. Its current production leaderboard/profile remain unavailable, the calendar is not a historical database archive, and the current submission flow does not establish verified competitive results.

| Frontend workstream         | What frontend is implementing                                                                                                                                   | What backend needs to provide                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Daily course loading        | Bounded loading, missing-day/error/retry states, stable course identity, and a new-day banner that preserves the active layout/run.                             | Canonical dated configuration, immutable rules/versions, server date and next Central day boundary.                                    |
| Guest progress              | Guest nickname UI, draft recovery, persistent pending submissions, refreshed server progress, and clear device-persistence limitations.                         | Secure persistent guest session, nickname update, attempt counts, frozen first-solve attempts and actual best results.                 |
| Tile setup and scoring      | Selected-tile controls, rotation, accessible placement, full rotated-shape bounds, and published per-tile costs in toolkit/results.                             | Authoritative inventory/costs/placement bounds; command/version acceptance coordinated with the shared engine patch.                   |
| Run lifecycle               | Frozen pre-run layout, duplicate-Play prevention, server-start acknowledgement, Stop/interruption handling and a simulated-duration cap.                        | Idempotent accepted starts, stable run IDs/attempt ordinals, ownership checks and run recovery reads.                                  |
| Shared evaluation           | A framework-free evaluator for existing goal hold, terminal outcomes, ticks, path length and costs; the frontend/shared-engine owner supplies rotation support. | Consume the same evaluator in authoritative replay verification; return canonical outcomes/metrics rather than trusting client scores. |
| Save and result feedback    | Visible provisional/saving/verified/retry states; durable retry after response loss or refresh; first solve separated from optimization.                        | Atomic and idempotent completion, verification errors, authoritative progress, daily eligibility and archive-only acceptance.          |
| Sharing                     | Copy result with date, verified metrics and game link; no placements/angles/replay commands; clipboard fallback.                                                | Verified saved metrics; rank/percentile only if available for the same board snapshot. No separate sharing service is required.        |
| Historical archive          | Date/month course browsing, progress indicators, pagination, direct date links and separate practice entries.                                                   | Published historical summaries, date lookup, per-guest status and stable pagination.                                                   |
| Global leaderboard          | Daily/archive scope, Top/Around me, current guest row, tied ranks, pagination and honest loading/empty/error states.                                            | Server-ranked best rows, population, tie/percentile values, freshness timestamp and closed-daily status.                               |
| Profile/help and acceptance | Minimal server-backed guest/course summary, accurate rules, responsive/keyboard regression checks and complete user-journey tests.                              | Real integration environment, verified records/readback, error fixtures and deployment/database evidence.                              |

Frontend can build and test these screens against deterministic API fixtures while backend work proceeds. Fixture completion does not demonstrate a real saved score, a genuine leaderboard or a ready production daily service. Frontend will not implement a parallel database/service layer or substitute production sample rankings.

### Shared end goals for iteration 2

The complete product must support this journey with real data:

```text
Open today's dated course
  -> recover or create persistent guest
  -> place/rotate the limited inventory and see its real cost
  -> Play accepts and counts one immutable run
  -> simulation ends in success/failure/timeout, or player stops
  -> server verifies terminal replay and saves the result once
  -> result/progress remain correct after refresh or network retry
  -> compare the guest's best verified result with other players
  -> copy a result without exposing the solution
  -> open and play a previous dated course
```

Joint completion requirements:

- [ ] Production serves the correct daily course and has a reviewed upcoming seven-day schedule with a named publishing owner.
- [ ] At least three historical dated courses can be browsed, opened by direct link, played and refreshed with correct progress.
- [ ] Everyone receives identical published configuration, inventory, magnitudes, costs and physics rules. Edits occur only before the run; fixed hazards cannot be moved or toggled.
- [ ] Guest identity, accepted attempts, immutable first-solve attempts and per-scope best results persist. Stopped/interrupted accepted runs still count; retries do not count twice.
- [ ] Actual successful layouts pass server replay. The client cannot manufacture a winning result, force cost, completion time or rank.
- [ ] The global board shows one actual best verified run per guest/scope, correct ordering and ties, and a useful current-guest position.
- [ ] Archived play remains available without changing a closed original daily leaderboard.
- [ ] Sharing reports correct verified metrics without revealing placements; pending/practice results never claim verified ranks.
- [ ] Network loss and refresh preserve recoverable submissions; visible UI distinguishes local results, pending saves, verified results and rejection.
- [ ] Both teams demonstrate the integrated flow using real database records and two independent guest sessions, including a retry and an improved solution.
- [ ] Shared engine/editor regressions, relevant automated checks, production route boundaries and desktop/mobile/keyboard acceptance pass; three uncoached playtests reveal no unresolved completion blockers.

Scope already confirmed by the project owner: limited inventory, edits before each run, and a persistent guest nickname/identity sufficient for the first leaderboard. OAuth, cross-device accounts, payments, new mechanics and procedural generation are not required to close iteration 2. The bonus course is optional. A finite simulation cap is included as a reliability task.

Proposed defaults still to align between teams: 60 simulated seconds / 7,200 ticks, rotation in 0.1-degree increments, authored integer tile costs, ranking by force cost -> tiles -> frozen first-solve attempts -> completion tick -> path length, and daily eligibility determined by server receipt within the original Central calendar day. These are implementation proposals, not evidence of existing backend behavior.

### Coordination and requested backend response

1. Confirm an owner and current status for B0-B7, especially anything already implemented, so frontend integrates rather than duplicates work.
2. Agree on section 6's contract or return an equivalent API mapping with example success/error responses. Coordinate route edits under `src/frontend/app/api/` despite backend owning their behavior.
3. Align simulation/rules versions and the shared evaluator before accepting ranked results; do not trust a client-provided success flag or metrics.
4. Deliver guest + dated puzzle + run-start/completion/progress APIs first; archive and leaderboard reads can follow while frontend completes panel work.
5. Provide the integration environment and documented way to provision reviewed test dates and two guests. Keep credentials in private configuration, not this document or chat.
6. Run one joint acceptance session after real integration. Report each dependency as implemented, integration-tested or blocked; a rendered screen alone does not close the milestone.

### Backend implementation checklist

### B0 — Agree on contract and versions

- [ ] Confirm endpoint names and DTOs in section 6, or supply equivalent endpoints with a field-by-field mapping before frontend integration.
- [ ] Confirm costs, maximum ticks, rotation command, placement bounds, path quantum, tie ranking, percentile, attempt counting and daily-window policies from section 2.
- [ ] Put agreed transport types in a shared module without Prisma/React imports; generate or maintain fixtures for frontend tests.
- [ ] Define the shared simulation-version export and reject unknown versions. Do not claim older unsupported replays can be verified by the latest engine.

Deliverable: reviewed contract, example JSON and version compatibility notes.

### B1 — Persistent guest identity

- [ ] Implement repeated-safe guest creation/recovery, read current guest, and nickname update.
- [ ] Use an opaque server-issued session in an HttpOnly cookie, Secure in production, SameSite=Lax, with a documented long-lived expiry. Reuse the session on refresh; a public ID or submitted userId must not authenticate a write.
- [ ] Add the minimum schema/migration for guest ownership; existing null-user anonymous rows are legacy unowned/unranked data unless ownership can be established legitimately.
- [ ] Validate nickname size/content; render as plain text, rate-limit changes, and do not require OAuth or unique nicknames.
- [ ] Protect mutations against unrelated origins; use correct production/proxy origin configuration rather than trusting an arbitrary Host header.

Deliverable: two clean browsers receive different guests; one browser retains identity after reload; one guest cannot read/finalize another guest's run.

### B2 — Idempotent run lifecycle and reliable persistence

- [ ] Add run-start storage with guest/puzzle ownership, immutable placement and version data, request UUID/hash, attempt ordinal, startedAt, and finalization status. Persist starts before acknowledging them.
- [ ] Assign attempt ordinals transactionally per guest/puzzle; identical start retries return the same ordinal. A same-key/different-layout request returns 409.
- [ ] Implement current-guest run read, request-ID recovery and completion endpoints. Reject unknown course fields, invalid transforms and incompatible versions before starting a ranked run.
- [ ] Finalize attempt, solution if successful, progress and per-scope best row in one transaction. Returning success after only writing an Attempt is insufficient.
- [ ] Make completion duplicate/race safe with a unique run result and immutable completion semantics. Return the committed response after an ambiguous retry.
- [ ] Count accepted starts even when interrupted/stopped or never finalized. Freeze first-solve ordinal transactionally at the first verified success; later optimization cannot reset it.
- [ ] Record interrupted/aborted outcomes without trusting them as verified successes. Do not require an active browser to preserve an already-counted start.
- [ ] Keep the existing client-reported POST APIs unranked or deprecate them. They must not provide a bypass into verified standings.

Deliverable: response loss, duplicate requests and parallel completions create one run/result and accurate persistent counters.

### B3 — Authoritative shared replay verification

- [ ] Consume the shared engine and pure run evaluator from F3/F4; do not fork frontend/editor physics or import a React hook into the backend.
- [ ] Load the canonical published puzzle and rules from storage; verify level/rules/simulation versions match the accepted start.
- [ ] Permit only supported setup commands for selectable tile IDs; enforce absolute angle range, position quantization, full shape placement bounds, immutable inventory/force magnitude, unique sequence numbers and bounded command count.
- [ ] Reconstruct from canonical tick 0 and apply the frozen layout once. Simulate up to the published maximum, compute the first terminal outcome and derive force cost, tile count, completion tick and normalized path length server-side.
- [ ] Use existing goal hold and hazard/portal behavior; enforce the terminal priority and path discontinuity rule in F4. Repeated replay in the server runtime must agree.
- [ ] Validate request body size, command count and maxTicks; bound verification CPU/memory and release Rapier worlds in finally blocks. Benchmark representative complex authored courses against the hosting runtime budget.
- [ ] If synchronous verification cannot fit the deployment budget, agree on an asynchronous job/status contract with the frontend before changing behavior; do not ship unbounded work or silently skip validation.
- [ ] Return authoritative metrics or structured rejection. Cross-browser bitwise equality is not promised; report server verification as authoritative and test known browser solutions against it.

Deliverable: a forged success/score cannot rank, invalid commands cannot move hazards, and genuine reviewed solutions pass server replay.

### B4 — Scoring, progress and leaderboards

- [ ] Compute one actual best successful run per guest/puzzle/board scope using force cost, tile count, frozen first-solve ordinal, completion tick, pathLengthQ.
- [ ] Implement competition ties, strictly-worse percentile, population counts, top pages, current guest row and Around me.
- [ ] Make best-result updates race safe; worse optimization attempts never replace the best.
- [ ] Determine daily eligibility using server timestamps and original Central date boundaries; archive includes all verified successes. Preserve original daily rows after closing even when archive results improve.
- [ ] Implement current-course progress read including attemptsStarted, firstSolveAttempts, bestDaily and bestArchive; include guest archive status efficiently.
- [ ] Return ranking metadata and metrics only; no commands, author solutions, session tokens, emails or unrelated personal records.
- [ ] Add indexes/queries for guest+puzzle progress and sorted puzzle+scope results. Test pagination and ties beyond the first page.

Deliverable: two guests' real scores sort correctly, duplicate attempts do not add rows, and archive improvement cannot rewrite a closed daily board.

### B5 — Daily and archive read APIs

- [ ] Extend GET today with title, rules, serverNow, todayDate and nextDailyAt, keeping canonical Level JSON separate from transport metadata.
- [ ] Add published non-future date lookup and month/cursor archive listing with per-guest unplayed/attempted/solved status.
- [ ] Validate dates/cursors/limits; cap list sizes. Do not accidentally expose unpublished future course configurations or author solutions through list/detail endpoints.
- [ ] Keep current-day lookup fresh and avoid shared caching of guest-specific progress/board data. Preserve immutable published historical configurations.
- [ ] Return stable missing-course/service-unavailable errors and safe logs. Do not return database connection strings or internal errors to browsers.

Deliverable: actual previous dated courses can be loaded and played independently of today's course; date boundaries pass DST tests.

### B6 — Publishing and production operations

- [ ] Provide migrations and deployment instructions; do not run production migrations/seeding as a side effect of preview builds.
- [ ] Publish at least the next seven reviewed daily courses plus at least three historical archive entries for acceptance. A documented scheduled manual batch is acceptable; procedural generation is unnecessary.
- [ ] Store an author solution and at least one alternative practical solution per required acceptance course, validated with the shared evaluator. Preserve expected metrics/version and keep commands out of public responses.
- [ ] Validate published costs exactly cover selectable tile IDs; bound rules; reject unsolvable/unreviewed or incompatible courses before publishing. Do not use the old starter placement as proof of solvability.
- [ ] Freeze published competitive content after attempts exist; issue a new revision/puzzle rather than silently changing a live course. Document cancellation/correction policy for a broken daily course.
- [ ] Add a daily availability check/alert and an operational owner for the next-date schedule. Verify a missing-date 404 is detected before users encounter it.
- [ ] Configure production DATABASE_URL and session settings through private deployment configuration. Keep credentials out of the handoff and repository.

Deliverable: production serves the correct current day and upcoming schedule, saves real verified results, and has a named publishing owner.

### B7 — Backend integration evidence

- [ ] Supply real database integration tests for guest recovery, ownership, accepted start, replay verification, atomic completion, retries, first-solve immutability, ranking and archive queries.
- [ ] Test concurrent starts/completions and day-boundary eligibility, including delayed retries after cutoff.
- [ ] Supply a staging/production smoke record showing one genuine solved replay persisted and retrieved after a new page visit.
- [ ] Update `src/backend/backend_api.md`, related stale references, and root setup instructions to reflect actual contracts and migrations.

Deliverable: backend acceptance results plus any limitations that block iteration 2 signoff. Mocked frontend API tests do not satisfy this item.

---

The following reference sections make this handoff self-contained. Proposed defaults and contracts require agreement between the teams before integration.

## 2. Scope and decisions

### Confirmed by the project owner

- Limited, identical tile inventory for every player of a dated puzzle.
- Players edit before a run; the entire layout is locked during simulation.
- A persistent guest identity and nickname are sufficient for iteration 2's global leaderboard. OAuth is not required.
- Backend implementation belongs to a separate team; prioritize frontend delivery and give that team explicit integration tasks.

### Implementation defaults proposed by this plan

Use these defaults unless the project owner or relevant team changes them before implementation. They resolve previously unspecified behavior; they are not previously approved product requirements.

| Decision             | Default                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Day boundary         | `America/Chicago`; server provides today's date and the next boundary as an ISO timestamp. Never calculate a day by adding 24 hours across DST.                                                                          |
| Rotation             | Include player rotation for selectable force tiles; absolute orientation quantized to 0.1 degree. Course hazards remain fixed.                                                                                           |
| Simulation cap       | 60 simulated seconds, 7,200 ticks at the existing 120 Hz. Published puzzle rules may choose a smaller positive cap.                                                                                                      |
| Tile costs           | Positive integer costs authored per tile, normally 1 / 2 / 4 for weak / medium / strong. A puzzle's published cost map is authoritative and immutable.                                                                   |
| Ranking              | Ascending force cost, tile count, attempts until first verified solve, completion tick, path length.                                                                                                                     |
| Equal scores         | Equal five-part tuples share competition rank: 1, 1, 3. Stable row ordering uses server-controlled completion timestamp and then opaque player ID, without changing rank.                                                |
| Percentile           | `100 * strictlyWorsePlayers / totalRankedPlayers`, using the same board population as rank; zero players means null. Show ties honestly and explain the population.                                                      |
| Attempts             | Every accepted ranked Play start counts, including stopped and interrupted runs. Editing, request retries, and practice do not count.                                                                                    |
| First solve          | Freeze the ordinal of the first run whose verified success is committed for that guest and puzzle. Later optimization cannot lower it. Concurrent results use server transaction order.                                  |
| Daily ranking window | Both run start and first successful receipt of its terminal submission must occur within that puzzle's original Central calendar day. A later receipt may save to the archive board, never alter the closed daily board. |
| Late save            | Show that progress was saved but the daily window closed. Do not imply an offline result was included in a frozen daily rank.                                                                                            |
| Offline play         | Local practice is available. A new ranked attempt requires an acknowledged server start; offline practice is never retroactively promoted into a ranked attempt.                                                         |
| Failed submission    | Persist the immutable submission locally and offer retry with the same run ID. Never show a pending result as verified.                                                                                                  |
| Bonus course         | Small optional task using an existing reviewed authored course. It never blocks required iteration 2 acceptance.                                                                                                         |

Do not derive a supposedly universal physical cost from raw force strength: different force types have different behavior. Authors choose costs explicitly; display the same published values everywhere. Imported and bundled practice courses may default to cost 1 and must be labeled unranked.

### Required to close iteration 2

- Reliable dated daily puzzle loading and an operational publishing process.
- Limited placement, rotation, locked playback, finite run outcomes, and consistent scoring.
- Persistent guest identity, course progress, first-solve attempts, and best results.
- Verified daily leaderboard and archive leaderboard views.
- Historical daily archive.
- Copyable, spoiler-free results.
- Real production persistence/integration evidence and an uncoached playtest.

### Explicitly outside required scope

OAuth, account recovery or cross-device identity, payments, unlimited modes, procedural generation, new springs/ropes/magnet systems, strict weekly themes, public solution replay, an optimal-solution solver, a visual redesign, and comprehensive lifetime profile analytics. Existing physics types and the editor stay supported. Do not add a tutorial campaign or new UI framework.

## 6. Proposed frontend/backend contract

This contract is a proposal for agreement, not an instruction to disregard the backend team's existing equivalent API. Use current same-origin Next.js handlers. Keep the current GET-today route where possible; new APIs can coexist with old POST routes during migration. Retire the old client-reported competitive write path before release, or make it explicitly unranked.

### Common rules

- JSON success responses; consistent errors `{ error, code, retryable }`, where `error` is a safe human-readable message.
- 400 malformed input; 401 invalid guest session; 403 wrong owner/origin; 404 missing course/run; 409 incompatible version or reused key with different payload; 422 invalid replay/layout; 429 rate limit; 503 temporary service failure.
- Browser requests use same-origin credentials. Mutation handlers validate origin/session; guest identity comes from the server cookie, never a caller's userId.
- Dates are `YYYY-MM-DD`; timestamps are ISO strings. Puzzle dates are server-defined Central days. IDs and cursors are opaque strings.
- `simulationVersion`, `rulesVersion`, level ID and level version identify immutable published competitive content. Never silently verify an old result against changed rules.
- Pagination replies include `nextCursor: string | null`. Cursor ordering remains stable for an archive page; leaderboard replies carry `asOf` so changed standings can trigger a fresh page 1.
- Validate full replay commands, allowed fields, placement bounds and costs; shape-only HTTP checks are insufficient.

### Shared domain DTOs

```ts
import type { Bounds, GameCommand, Level } from '../game';

type Metrics = {
  forceCost: number; // integer sum of enabled selectable-tile costs
  tileCount: number;
  completionTick: number; // terminal tick; success needed for ranking
  pathLengthQ: number; // rounded world path length * 1024
};

type PuzzleRules = {
  rulesVersion: string;
  simulationVersion: string;
  maxTicks: number; // default 7200; positive bounded integer
  placementBounds: Bounds;
  tileCosts: Record<string, number>; // exactly the selectable inventory IDs
  rotationAllowed: boolean;
};

type PuzzleResponse = {
  id: string;
  date: string;
  title: string;
  seed: string;
  difficulty: number;
  configuration: Level;
  rules: PuzzleRules;
  serverNow: string;
  todayDate: string;
  nextDailyAt: string;
};

type Placement = {
  levelId: string;
  levelVersion: number;
  rulesVersion: string;
  simulationVersion: string;
  commands: GameCommand[];
};

type SavedResult = {
  runId: string;
  outcome: 'success' | 'stopped' | 'water' | 'lava' | 'timeout' | 'aborted' | 'interrupted';
  verification: 'verified' | 'not-applicable';
  metrics: Metrics | null; // null for interrupted/aborted
  dailyEligible: boolean;
  savedAt: string;
};

type PuzzleProgress = {
  puzzleId: string;
  attemptsStarted: number;
  firstSolveAttempts: number | null;
  bestDaily: SavedResult | null;
  bestArchive: SavedResult | null;
};
```

Rules live alongside `configuration`; do not put `tileCosts`, max ticks or session data into canonical Level JSON. Backend storage may use additional puzzle columns or a versioned envelope; the team chooses storage while preserving this public contract.

### Endpoints and example shapes

| Endpoint                                                                     | Required behavior                                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/guest`                                                            | Create or recover current guest cookie; safe to call repeatedly. Returns `{ player: { id, nickname } }`. New guest gets a generated nickname.                                                       |
| `GET /api/me`                                                                | Returns `{ player: { id, nickname } }` for current session; no secret token in JSON.                                                                                                                |
| `PATCH /api/me`                                                              | Accepts `{ nickname }`; returns updated public player. Proposed nickname: 3-24 trimmed visible characters, plain text, no control characters; uniqueness not required.                              |
| `GET /api/puzzles/today`                                                     | Returns PuzzleResponse; missing day is 404 with stable error code.                                                                                                                                  |
| `GET /api/puzzles?month=2026-10&cursor=...&limit=20`                         | Published, non-future archive summaries plus current guest's per-puzzle status; no complete configurations or author solutions.                                                                     |
| `GET /api/puzzles/by-date/2026-10-25`                                        | Returns PuzzleResponse for a published historical date.                                                                                                                                             |
| `GET /api/me/progress?puzzleId=...`                                          | Returns PuzzleProgress; zero attempts is a valid empty state.                                                                                                                                       |
| `POST /api/runs`                                                             | Idempotent accepted Play start; body below. Server freezes layout/context, records startedAt and assigns per-guest/puzzle attempt ordinal.                                                          |
| `GET /api/runs/by-request/{requestId}`                                       | Recover an ambiguous start response for the current guest. 404 means not registered; safely retry the same request ID.                                                                              |
| `GET /api/runs/{runId}`                                                      | Read current guest's run state and saved result for refresh/retry reconciliation.                                                                                                                   |
| `POST /api/runs/{runId}/complete`                                            | Idempotent completion/abort; synchronously verifies a terminal replay within bounded server work and atomically stores result/progress/best-row changes. Returns authoritative result and progress. |
| `GET /api/puzzles/{id}/leaderboard?scope=daily&view=top&limit=20&cursor=...` | Returns server ranks, tied rows, population, current guest summary, `asOf`, final flag and nextCursor. Also supports scope=archive and view=around-me.                                              |

Archive list item:

```json
{
  "id": "puzzle-opaque-id",
  "date": "2026-10-25",
  "title": "Straight Forward",
  "difficulty": 1,
  "status": "solved"
}
```

Accepted Play start:

```ts
// POST /api/runs
type StartRunRequest = {
  requestId: string; // client-generated UUID, reused on retry
  puzzleId: string;
  placement: Placement; // immutable final setup, no future mid-run commands
};
type StartRunResponse = {
  runId: string;
  requestId: string;
  attemptOrdinal: number;
  startedAt: string;
  progress: PuzzleProgress;
};
```

Persist the same request ID before sending. The server's unique key is `(guestId, requestId)`; an identical retry returns the same run and ordinal, a different payload returns 409. A start response lost in transit must not lead to a new ID or another counted attempt. Reconstructed setup commands must have unique sequence numbers and be applied before the first physics step.

Completion:

```ts
// POST /api/runs/{runId}/complete
type CompleteRunRequest =
  { kind: 'terminal' } | { kind: 'aborted' | 'interrupted'; observedTick: number };

type CompleteRunResponse = {
  result: SavedResult;
  progress: PuzzleProgress;
};
```

Terminal verification replays the server-stored layout; no client success flag or metric determines acceptance. `observedTick` on interrupted/aborted runs is informational, bounded, and never generates a winning score. Once finalized, retry with the same payload returns the same saved response; a conflicting completion returns 409 plus a safe way to recover the existing result. No new run is created by completing an existing one. Crash recovery must check for an already committed completion before marking an existing run interrupted.

Leaderboard response:

```ts
type LeaderboardRow = {
  rank: number;
  player: { id: string; nickname: string };
  metrics: Metrics;
  firstSolveAttempts: number;
  percentile: number;
};
type LeaderboardResponse = {
  puzzleId: string;
  scope: 'daily' | 'archive';
  rows: LeaderboardRow[];
  me: LeaderboardRow | null;
  totalPlayers: number;
  nextCursor: string | null;
  asOf: string;
  final: boolean; // closed daily board; archive remains open
};
```

The archive board includes all verified successes for that puzzle, including original-day solves. The daily board includes only successes eligible within the original daily window. Keep separate best rows per scope; later archive optimization must not replace a closed daily row. Row metrics come from one actual best run, never a combination of force from one run and time from another. `firstSolveAttempts` is the frozen puzzle-level first-solve ordinal for that guest, shared across scopes.

## Shared engine coordination details

Frontend/shared-engine owners implement these shared changes; backend consumes the same command interpretation and evaluator. Coordinate ownership before editing these modules.

### F3 — Placement, rotation and actual published tile costs

- [ ] Add `angle` to `FieldDraft`, initialized from engine render state; keep position, angle and enabled state for every selectable field.
- [ ] Add engine `GameCommand` variant `{ type: 'set-field-angle', fieldId, angleQ, sequence }`. `angleQ` is an absolute orientation integer in `[0, 3599]`; dequantize with `angleQ * Math.PI / 1800`.
- [ ] Normalize orientation, validate safe integer/range and unknown commands, and apply with an exhaustive switch. Current `move-field` / `else toggle` handling must not interpret rotation as a toggle.
- [ ] Keep angle in snapshots and restored state; invalidate prepared field geometry/loads when it changes. Preserve old replay commands and unchanged canonical Level JSON.
- [ ] Update the backend command boundary contract together with the engine change. Export one simulation-version constant; bump it when interpretation changes, and publish new competitive puzzles against that version.
- [ ] Build setup field polygons from canonical local shape plus draft translation/rotation. Update force arrows, hit testing, selected outline, dragging and bounds checks from that same transform.
- [ ] Add an explicit selected field state shared between canvas and toolkit. Show the selected field's name, authored cost, angle and compact Rotate left/right controls (15-degree steps); offer an accessible angle input.
- [ ] Provide compact selected-tile X/Y inputs or keyboard move controls so tile placement and rotation can be completed without a pointer. Scope shortcuts to the focused game control; do not intercept typing elsewhere.
- [ ] Validate full rotated field geometry inside published placement bounds. Reject invalid rotation with inline feedback and retain the last valid transform; do not silently alter other tiles. Preserve existing pointer drag clamping.
- [ ] Leave water/lava/portals and other fixed course objects out of selection, commands, inventory, rotation and costs.
- [ ] Use published `tileCosts[fieldId]` for toolkit labels, live totals, result displays and copy text. Remove hardcoded competitive `TILE_COST` usage and hardcoded scoring help.
- [ ] Locked runs disable toggling, movement, rotation and reset actions that would mutate the frozen layout. Stop explicitly ends the run before returning to setup.
- [ ] Keep the half-second direction hint; do not restore a complete solution preview.

Acceptance: the rotated shape, force direction, preview and actual replay agree; player/editor playback uses the same engine; invalid bounds and fixed-object commands are rejected; a 1+4 tile layout displays cost 5, not 2.

### F4 — Finite run lifecycle, shared metrics and visible result states

- [ ] Extract pure goal/run evaluation into `src/game/run-evaluation.ts`; frontend and backend consume the same functions. Keep a re-export wrapper at the old goal helper if useful for compatibility.
- [ ] Evaluate after every physics tick, using the current goal hold semantics. Do not introduce a new capture-speed rule or change collision/drag behavior in this milestone.
- [ ] Define terminal priority at a tick: target hazard/destruction first, valid goal completion second, stopped outside goal third, max-tick timeout last. A valid goal on the cap tick counts; waiting in a portal must not count as settled or inside the goal.
- [ ] Sum target-body center displacement from tick 0 through the terminal tick, once per tick. Exclude teleport jumps by resetting the previous-point accumulator across capture/release; count actual travel before capture. Do not include rendering interpolation or sum every dynamic body.
- [ ] Normalize server ranking path length to an integer quantum of `1 / 1024` world unit after accumulation (`Math.round(total * 1024)`). Keep ticks as integers and derive displayed seconds from fixed DT.
- [ ] Add results for success, stopped, water, lava, timeout, and interrupted/aborted. Existing success/failure states must remain frozen after their first terminal tick.
- [ ] Freeze commands and complete puzzle/rules/version context when Play is selected. Await an idempotent server start acknowledgement before competitive simulation begins. Disable duplicate Play while starting; edits remain locked for that frozen request.
- [ ] If start fails, retain setup and offer Retry or explicitly unranked practice. Never silently start competitive simulation without an accepted run.
- [ ] Register Stop as an abort of that same acknowledged run, not a deleted attempt. Do not classify a normal completed result as aborted when the user closes its dialog or clicks Try again.
- [ ] Replace WeakSet-only submission with durable run-specific pending state. One backend completion transaction replaces the old attempt-then-solution pair for this UI.
- [ ] Display visible save/verification status near the result and a persistent compact status in the game after the dialog closes: Saving, Saved and verified, Retry save, or Saved outside daily window. An `sr-only` status alone is insufficient.
- [ ] Keep the local result labeled provisional until server verification returns. Use authoritative returned metrics and ranking eligibility for persistent displays; explain a discrepancy or rejection without silently rewriting history.
- [ ] Show current attempt count, immutable first-solve count where available, best force cost, tiles, simulated time, and path length in the result. Separate first solve from later optimization attempts.
- [ ] Add a visible run timer based on simulation ticks, with the cap in Help. Background tabs must not consume simulated seconds based on wall-clock time.

Acceptance: cap occurs on the exact same tick at different frame rates; goal/hazard precedence remains correct; a double click or network retry cannot count twice; terminal saving survives refresh; simulation and editor remain compatible.
