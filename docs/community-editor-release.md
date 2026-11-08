# Community editor implementation evidence

**Current publishing approach:** [Community publishing MVP](community-publishing.md)
supersedes the VM prerequisite below for the website's simple publishing flow.
The remaining sections preserve the earlier isolated-verifier milestone evidence;
they do not block the Vercel request-based MVP.

Baseline: `b3c12425cca443a56af02e2c2a4e8430da035f83`, branch `community-editor`.
The initial checkout was clean and HEAD equaled the baseline. The approved design
sources are the v2 base plan, v3 A01–A16 and v4 B01–B09 under
`artifacts/community-editor/`. V4 overrides v3, which overrides v2 only where stated.
The November 6 implementation assignment supersedes their earlier documentation-only restriction.

## Implementation map

| Boundary | Existing implementation | Implementation destination |
| --- | --- | --- |
| Transport/contracts | `src/shared/puzzle-contracts.ts`; daily parser unchanged | `src/shared/strict-json.ts`, community canonical/profile modules |
| Geometry/physics | `src/game/levels/{codec,document,parse}.ts`, `run-evaluation.ts` | Reuse directly after bounded profile admission; no engine fork/version bump |
| Editor | `level-editor/app/page.tsx`, `components/`, `editor/model.ts` | Browser-safe `src/editor/` with injected persistence; local filesystem library stays server-only |
| Gameplay | `src/frontend/{puzzle,engine-adapter,course-canvas,player-controls}.tsx` | Presentation shared; daily session ownership stays in daily controller |
| Persistence | `prisma/schema.prisma`, migrations, `src/backend/competitive*.ts` | Eight additive community models, restricted RPCs and isolated migration tests |
| Verifier | No existing community runner | Two fixed supervised execution units; bounded child IPC and shared engine |
| Evidence | `tests/*.test.ts`, `*.spec.ts`, `*.integration.ts`, frontend workflow | Contract vectors, production-validator inventory, browser parity, actual-role and VM evidence |

## Gates

No community route or public publication is enabled by foundational work.
The user confirmed the DigitalOcean VM is not available. Selected-host measurements
and deployed TLS/SCRAM runtime logins remain unproven. A disposable local PostgreSQL
17 cluster was initialized under `.cache/community-postgres` on loopback port 55434.
Its independent-login SQL feasibility tests do not prove production RPC permissions
or cgroup memory, network isolation, process-group death or physical replacement safety.
PR1/M1 remains open until those tests run on the selected host. Later publication
and finalization work must not bypass that prerequisite.

The implementation owner, operator, product approver and self-reviewer named in the
design is Hurdamert. This file records technical evidence, not their acceptance signature.

## Requirement ledger

| Requirements | Scope | Status |
| --- | --- | --- |
| R01–R03, R16, R22, R26 | Canonical candidates, profile, proof, artifact, transport, inventory | Local contract/profile/Node/Chromium evidence passes; full application/deployment acceptance open |
| R07–R09, R20, R24; B02/B03/B06/B07 | Capacity, lifecycle, permissions, scheduling and durable evidence | CPU child and lifecycle/SQL feasibility pass; target VM, production roles, dispatcher and durable DB journal unproven/unimplemented |
| R04 | Shared browser/controller capability boundary | Actual browser bundle graph excludes backend, filesystem and competitive ownership; community controller not implemented |
| R05–R06, R10–R15, R17–R19, R21, R23, R25, R27 | Application, database and public-launch behavior | Not implemented |
| D01–D06 | Existing daily, persistence, scheduling, storage, editor and replay regressions | Unit and real daily DB checks pass; final browser/build evidence recorded below |

Every later milestone must record exact commands/results, fixture/runtime/commit identities,
limitations and acceptance independently. A build or screenshot is not publication acceptance.

## Phase 0 / PR1 local implementation

Implemented strict UTF-8/scanner/visitor decoding with the pinned `jsonc-parser@3.3.1`,
reviewed `canonicalize@2.1.0` with strict JSON-data guards, complete bounded structural
and geometric profile phases, server-context candidate normalization and four separate
SHA-256 identities. The web-save structural function does not call engine geometry.
Candidate DTOs carry configuration objects; exact canonical bytes are derived for storage,
avoiding a large JSON string that would violate the transport's 4096-byte scalar cap.

Tracked vectors cover JCS equivalence, tampering, metadata-only identity and eleven
moving/hazard/portal/borderless scenes. Node and Chromium execute the same digest-checked
2,151,809-byte engine module. Simulation/rules constants and all engine sources are unchanged.
The profile inventory calls the production validator and reproduces 21/33 accepted
unchanged and 33/33 after explicit conversion. See
[compatibility evidence](community-editor/compatibility-evidence.md) for exact checksums.

The CPU-only verifier prototype performs strict bounded IPC, exact artifact loading,
proof replay and a full 7200-step benchmark. Local lifecycle tests cover the v4 timing,
retry/deadline, fence, confirmed-release and bounded-history rules. The selected-host
systemd template and required measurements are in `ops/community-verifier/`.
There is no production supervisor/launcher, dispatcher or finalization RPC.

The real PostgreSQL probe creates uniquely named disposable NOLOGIN owner/execution
roles and distinct nonprivileged web/runner LOGIN connections. It checks denied direct
candidate/version/control writes and web RPC calls, races two claims against the exact
v4 partial reservation predicate, retains terminal-held capacity, rejects stale/unconfirmed
release and preserves historical assignment after reuse. This scratch-schema probe is
explicitly not a production migration, result-authenticity proof or selected-host test.

Files: `src/shared/{strict-json,community-*}.ts`, `src/community-verifier/`,
`scripts/*community*.ts`, `tests/community-*`, `tests/fixtures/`,
`ops/community-verifier/`, package scripts and the existing CI workflow.

**PR1/M1 acceptance: not passed.** The missing VM is a required external gate,
not a reason to infer production isolation from passing local tests.

## Independent shared-editor / gameplay extraction

Moved the existing model, canvas, inspector, playtest, shell and stylesheet into
`src/editor/`. The localhost page injects `repositoryPersistence`; filesystem writes
remain solely in the existing trusted library/API. Explicit compatibility exports keep
older static and dynamic model imports working. Public adapters can supply separate
storage/recovery and curated starters; no community cloud adapter is wired yet.

`src/frontend/gameplay/gameplay-view.tsx` supplies shared canvas, toolkit and run controls.
The daily page retains all session/API/progress ownership and supplies Play/Stop callbacks.
Actual bundle metadata verifies the shared editor/view import neither backend/filesystem
capabilities nor competitive ownership modules. Editor CSS is moved without visual redesign.

The browser suite exposed two issues during extraction: wildcard reexports were not
visible to Node named dynamic imports through Playwright's CJS transform (fixed with
explicit bindings), and the leaderboard could open before an archive load then be closed
by that response (control now waits for a loaded course). A delayed archive regression
covers the latter. Existing tests were retained unchanged.

Files: `src/editor/`, `src/frontend/gameplay/`, `src/frontend/app/page.tsx`,
the local editor wrapper/adapter, compatibility model export, and `tests/gameplay-view.spec.ts`.

This is the independent refactor foundation, not a complete community player or PR2
release acceptance. Cloud drafts, IndexedDB instance recovery, tickets, persistent jobs,
immutable publication, restricted routes and public-launch systems remain outstanding.

## Verification record

- `npm run db:generate`: passed.
- `npm run typecheck`, `npm run format:check`, `git diff --check`: passed before final review.
- Final `npm test`: 108 passed, 1 existing Windows symlink test skipped, 0 failed.
- `npm run community:profile`: passed, 33 fixture/source/sidecar snapshots checked.
- Final `npm run test:community:browser`: all 3 passed, including the eleven-scene matrix.
- `npm run community:verifier`: standalone child built and executed successfully with
  the exact engine artifact (7200-step benchmark, ~403 ms cold local process). This
  caught and corrected a UMD/ESM parser packaging error that the source-runtime child
  test alone did not expose; both runtime forms are now permanent unit regressions.
- Existing editor browser baseline before extraction: 8 passed.
- `npm run editor:build`: passed after extraction.
- Final `npm run test:integration`: all 4 passed (three daily checks and the independent role/reservation probe).
- Initial full browser run: 68 passed, 2 failures. Affected rerun: 14 passed, remaining
  archive-load race failed. The expanded full run had 71 passed/1 failed before the final
  loaded-context guard. The original unmocked two-guest replay and delayed archive
  regression then both passed on a fresh database (2 passed, 0 failed). No test was
  skipped or weakened to obtain that result; the complete 72-test run was not repeated
  after this last focused fix.
- `npm run game:build`: passed after browser processes stopped.
- `npm run test:ui:production`: passed; production `/` returned 200 and `/modal-preview` 404.

The first integration run accidentally provisioned authored daily courses rather than the
CI opening fixture set, yielding 2 passed/1 failed. A separate fresh test database with
`PUTTENTIAL_COURSE_SET=opening` fixed the fixture mismatch; no daily/test code changed.
All databases used here are isolated local test databases. Existing `.env`, configured
application database, schema and authored JSON/sidecars were preserved.
The disposable PostgreSQL cluster is stopped after verification; its files remain
under `.cache/community-postgres` for local reproduction.

Local logs/screenshots are under `artifacts/community-editor/`, `artifacts/editor/`,
`artifacts/iteration-two*/` and `artifacts/replay-viewing/`. Editor screenshot reviewed
at native size. CI is configured; no remote run, PR, production deployment or public release occurred.

Implementation commits:

- `0da43ed` — shared editor/gameplay extraction.
- `3283618` — add strict community JSON decoding.
- `976afb6` — validate community course profiles.
- `01328a3` — add canonical candidates and browser replay vectors.
- `8cb69ef` — prototype verifier execution and reservation checks.

## Resume prerequisite

Provision/approve the selected VM separately, supply operator access and an isolated
database supporting the approved restricted identities, and run the measurement checklist
in `ops/community-verifier/README.md`. Passing that gate permits subsequent durable
publication/finalization work. Public launch additionally requires the complete R01–R27 /
D01–D06 ledger, recovery/moderation/operations, rollback and human acceptance.
