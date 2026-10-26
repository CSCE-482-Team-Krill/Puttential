# Revision 3.1 frontend implementation evidence

Recorded October 26, 2026 (America/Chicago). This is the implementation evidence companion to the supplied revision 3.1 brief, including its section 10. It does not change the pre-existing untracked planning documents in `docs/` or the attachment outside this workspace.

## Checkout and ownership

- Repository: `CSCE-482-Team-Krill/Puttential`.
- Actual branch: `iteration-2-frontend-final`.
- Actual initial HEAD: `4bb30887fe319611db81b6b6a094b4734b7b13de`.
- Initial `git status --short`: `?? docs/` only. Those files were inspected and preserved.
- Frontend revision: the uncommitted working diff against that HEAD. No commit, merge, deployment, production-data write, migration or seed was performed.
- Read root `AGENTS.md`, `README.md`, the entire supplied revision 3.1 plan in bounded sections, frontend sources, engine exports/types/commands, workspace scripts and existing tests. No more-specific `AGENTS.md` was found.
- The intended branch/SHA match. The actual backend and engine are still the legacy baseline, not the capabilities described as future deliveries in the brief. Existing `docs/` handoff wording includes older ownership/contract descriptions; it was not treated as delivered implementation or overwritten.
- No engine, backend service/handler, schema, authored level or editor implementation was changed. Editor test fixture setup was made deterministic. Incidental tracked screenshots and generated Next declarations were restored from HEAD after checking the initial state.

## Delivered frontend work

| Area | Implementation and independent verification | Real integration boundary |
| --- | --- | --- |
| F0 contract/client | Proposed revision 3.1 DTOs, runtime Level/metadata validation, numeric limits, errors, bounded interactive requests and one document-wide scheduler. Tests cover complete setup envelopes, unknown versions via adapter gating, malformed data and limits. | G0 agreement is not supplied. No claim that another owner imports these types. |
| F1 course context | Stable content keys; separate source/availability/progress; bounded loading, missing-day, incompatible-data and unavailable states; explicit practice selection; monotonic rollover hints and manual date selection. Same-content refresh retains the level object and execution. | Live today response lacks target rules/version/availability metadata and is rejected honestly. |
| F2 identity/recovery | Cookie-confirmed bootstrap, nickname editing, guest-scoped drafts/progress, bounded IndexedDB, immutable per-run records, memory fallback, nonwaiting execution locks and explicit orphan recovery. Distinct tabs may start distinct runs. | Guest endpoints/cookie semantics need backend delivery. Real IndexedDB terminal-intent refresh recovery passes with HTTP fixtures. |
| F3 setup | Shared canvas/toolkit selection, keyboard X/Y, full-polygon bounds checks, inward quantized pointer clamping, selected outline, individual published costs and live totals. Rotation input/buttons and render transform use the adapter port. | Rotation/canonical setup await E0; controls are disabled in the current installed engine. No angle command was cast into old engine types. |
| F4 lifecycle/results | Local hook remains unranked and API-free; finite local cap/tick timer; wrapper persists full start, acknowledgement and immutable completion in order. Pending, delayed, verified, outside-window, rejection and cancellation copy; authoritative metrics are distinct from provisional local results. | E0 must supply authoritative shared terminal/path evaluation, tick-zero application and version support. No browser path heuristic is represented as authoritative. |
| F5 sharing | Spoiler-free copy with selectable fallback. Saved-run availability refresh; cancellation/historical labels; exact viewer/puzzle/scope/bestRunId attribution. Worse/equal runs cannot borrow a best result's rank. | Saved result/board reads are fixtures until backend delivery. |
| F6 archive | Server summaries, month filter, pagination, statuses, separate practice entries, date detail reads, `?date=` links and Back/Forward handling. Existing course remains during loading. | No target archive endpoints exist in this checkout. Fixture list contains three historical dates; the browser journey opens and refreshes October 24. |
| F7 leaderboard | Daily/archive, Top/Around me, server ranks/ties/percentiles/population/finality; viewer namespaces and generation guards; bounded revision restart. Contradictory unchanged-viewer responses stop for manual refresh after confirming the cookie. | Real ranking, private/no-store responses and viewer-bound server cursors need backend delivery. |
| F8 profile/help | Nickname/session explanation, current-course starts/first-solve/best, truthful unavailable states and updated rules/recovery help. Modal focus trap includes selects and textareas. | Lifetime analytics are not fabricated. Current progress is server-backed when the target API is supplied. |
| F9 orchestration | Two HTTP operations, one completion and one operation per run; first owned terminal POST dispatch priority; FIFO background fairness; Retry-After/backoff; six failed-transport limit; delayed/blocked polling retains the intent. Independent progress/run/availability revision ordering. | Receipt registration, admission limits, real replay, serialization and daily finality remain server responsibilities. |
| F10 checks/docs | Existing regression suites updated for explicit practice and retired legacy writes; new lifecycle/unit/browser fixtures; both builds, production preview checks and screenshots. New Ubuntu CI workflow supplied. | Workflow has not run remotely; real acceptance/playtests remain open. |

`src/frontend/README.md` describes the source boundaries and adapter. `src/shared/puzzle-contracts.ts` is explicitly proposed transport revision 3.1. There is no production fixture switch, replacement backend or separately implemented physics engine. The legacy attempt/solution endpoints remain backend-owned; the competitive UI no longer calls them.

## Automated checks

Environment: Windows PowerShell, Node `v24.19.0`, installed root workspace dependencies, Chromium through Playwright. No dependency or lockfile changes were needed.

| Check | Actual result |
| --- | --- |
| `npm.cmd run db:generate` | Passed; generated local Prisma client only. |
| `npm.cmd run typecheck` | Passed. |
| `npx.cmd tsx --test tests/iteration-two.test.ts` | 27/27 passed on final lifecycle/validation changes. |
| `npm.cmd test` | 58/59 passed. The sole failure is the inherited Windows symlink permission assertion described below; all 27 new frontend tests pass. |
| `npm.cmd run test:e2e -- --reporter=line` | 51/51 passed with a clean runner exit. Includes editor interoperability, hazards/portals, keyboard/focus, mobile/desktop, direct links, costs, copy fallback, memory fallback and real IndexedDB recovery using intercepted HTTP. |
| Final targeted archive/profile/leaderboard/recovery/sharing browser checks | 8/8 passed, including an in-flight share canceled after a source-only rollover while canvas and draft are retained. This final targeted pass follows the 51-case full-suite run. |
| `npm.cmd run editor:build` | Passed. |
| `npm.cmd run game:build` | Passed after replacing a BigInt literal with `BigInt(1)` for the frontend workspace's older TypeScript target; exact counter comparison is retained. |
| `npm.cmd run test:ui:production` | Built local app `/` = 200, `/modal-preview` = 404; no example rankings exposed. |
| Formatting / whitespace | Touched TypeScript/React/CSS formatted with root Prettier; `git diff --check` reviewed. |

The existing Windows unit failure is `tests/level-editor.test.ts`, “repository saves canonical game JSON and sidecar, increments content versions, detects conflicts”: file symlink creation returns `EPERM`. The security assertion was not weakened or skipped. The new Ubuntu workflow runs the same test; no passing CI result is invented. A green full unit suite still requires a symlink-capable environment.

Earlier browser iterations caught and fixed draft namespace restoration, an off-grid pointer clamp, selected-outline raster expectations, and short-height toolkit crowding. Development servers were stopped before builds. Browser teardown exits cleanly when the test-owned server lifecycle is avoided by explicitly running the two local dev servers during checks; no claim is made that the earlier Windows teardown defect is universally fixed.

## Fixture evidence versus real integration

All guest IDs, accepted runs, verified results, revisions, timestamps, receipts, board rows and ranks used in the new tests are deterministic fixtures. Browser interception never proves PostgreSQL persistence or server verification. Fixture simulation and actual local Rapier/editor regressions are separately scoped:

- The course-session executor fixture acknowledges ordered starts and completion transitions; it does not establish E0 physics equivalence.
- Existing Rapier/codec/hazard/portal tests still exercise the installed engine and unchanged editor. Local goal semantics stay at the existing frontend compatibility implementation; shared E0 extraction remains external.
- Lost start response, canceled late acknowledgement, same-ID retry, immutable intent, another tab's busy lock, distinct same-course tab runs, delayed infrastructure verification and receipt-critical dispatch have deterministic controller tests.
- Exact decimal revisions are tested above JavaScript's safe integer precision. New progress cannot reopen saved lifecycle state; newer cancellation metadata accompanies an unchanged saved result.
- Viewer A/B and unsolved `me: null`, invalidated pages, wrong-viewer cursor errors, equal/worse run sharing and distinct scope identities are frontend tests. No genuine cross-cookie server cursor enforcement is claimed.
- IndexedDB opening/late callback and lock-stall deadlines have deterministic tests. A real browser IndexedDB terminal record is read and reconciled after refresh, without another start or playback. A persistence retry never migrates an active memory-only run silently.
- Server day duration/DST scheduling is tested independently of the client calendar clock. Real midnight lock ordering, commit/rollback, finalizer barriers and receipt timing are not frontend-testable proof and remain backend gates.

No named engine/backend/publishing owner, agreed production version, replay benchmark, hosting budget, numeric admission profile, production replica guarantee or operational recovery evidence was supplied. No team agreement or capacity values were invented.

## Missing dependencies / handoff

1. **G0:** Backend/engine owners must accept revision 3.1 or document an equivalent mapping, including numeric limits, identity preconditions, retention, supported versions and measured replay/admission budgets. The existing untracked handoff must travel with the complete supplied revision 3.1 section 6, not stand alone as the API specification.
2. **E0:** Deliver canonical transforms and complete setup, angle commands, tick-zero application, version exports, framework-free terminal evaluation, movement/path trace and browser/editor/server replay evidence. Bind these through `engine-adapter.ts`. `deliveredEngine` remains undefined, so production ranked starts and rotation are unavailable even when a target-shaped fixture course renders.
3. **Backend B0–B5:** Deliver `/api/me`, `/api/guest`, nickname/progress, dated archive/detail, idempotent start/run recovery/complete and viewer-bound leaderboard APIs. The legacy today route does not satisfy the new envelope. Saved run reads and completion retries must include current availability.
4. **Backend B6–B7 / publishing:** Real verified replay/database readback, immutable daily window qualification, serialized acceptance/receipt/commit/finality, cancellation authority, worker recovery/admission limits, supported dates and provisioning. The frontend cannot prove or replace these capabilities.
5. **Acceptance:** Confirm the seven-day schedule and publishing owner, exercise at least three real historical dates and multiple practical solutions, two real guests/optimization/ties, production readback, three uncoached playtests and owner signoff. None occurred in this frontend-only task.

Optional F11 bonus is not delivered; it does not block the required milestone. No consequential product policy was changed and no unresolved new product choice was required to continue independent frontend work.

## Visual evidence

Native-size PNGs were inspected. `desktop-before.png`, `mobile-before.png` and `profile-before.png` were freshly rendered from an isolated `git archive` of the original HEAD with a deterministic missing-day response, using a separate local port. The archive's temporary webpack server was stopped. They are not screenshots from an old deployed site.

`desktop-after.png`, `mobile-after.png` and `leaderboard-mobile-after.png` show target-shaped HTTP fixtures in the implemented UI; names, costs and dates are examples, not live standings. Before/after data and viewport content differ: the baseline demonstrates missing-day practice, while the new published fixture deliberately shows authored 1+4 costs and unsupported-engine feedback. Broader screenshots and contrast measurements are under `ui-regression/`. No existing mockup image or texture was edited.

**Milestone disposition:** independent frontend work is implemented and fixture-tested; integrated iteration 2 and production acceptance remain blocked by G0/E0, target backend delivery and the operational/playtest evidence above. Real competitive integration has not been established.
