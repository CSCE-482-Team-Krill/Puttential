# Iteration 2 integrated completion evidence

Recorded October 26, 2026, America/Chicago. Base revision: `825ae40` on `iteration-2-frontend-final`. This record supersedes the missing-code dependencies in the preceding frontend-only evidence; it does not claim production deployment or human acceptance.

## Delivered

- One shared Rapier implementation supplies canonical complete setup, absolute 0.1-degree rotation, tick-zero application, version exports, terminal evaluation and movement/path metrics excluding portal jumps. Browser adapter and server replay use the same evaluator. The editor retains the shared engine.
- PostgreSQL migrations add opaque guest sessions, per-guest progress, immutable accepted runs/completion receipts, verification leases and signed pagination settings. Legacy prototype data stays separate and unranked.
- Real same-origin guest, nickname, progress, daily/date/archive, run recovery/completion and daily/archive leaderboard APIs replace the missing endpoints. Scores and successes come from server replay, not submitted client metrics.
- Starts, receipt registration, result/progress commits, board snapshots and cancellation serialize through puzzle locks. Accepted starts count once, first-solve ordinal freezes, best results cannot regress, ties share competition rank and percentiles count strictly worse players.
- Pre-cutoff eligible receipts keep daily boards provisional until verification finishes. Expiring leases recover worker loss; bounded admission and operator recovery prevent infrastructure failure from silently becoming a player rejection. Cancellation preserves saved historical verification and terminates unfinished runs.
- Publishing provisions reviewed opening courses with two distinct practical solutions per course, retains existing dates, validates a seven-day schedule and benchmarks full-cap replay. The project owner confirmed ownership of daily publishing and the target `https://puttential.vercel.app/`.
- Native screenshot review found and fixed narrow archive/practice text columns and the small copy fallback outside modals. Empty notice decoration is hidden. Before/after archive screenshots are included.

## Actual checks

Environment: Windows, Node v24.19.0, PostgreSQL 17.6, Chromium. A fresh isolated cluster on loopback port 55432 was used because the configured local port 5432 refused connections. Existing configuration, databases and production data were not changed.

| Check | Result |
| --- | --- |
| Prisma generation and root typecheck | Passed |
| Full unit suite | 63 passed, 0 failed, 1 explicit Windows symlink-capability skip; Linux CI retains the security assertion |
| Fresh migration application and Prisma schema comparison | Passed; final migration/schema report **No difference detected** |
| Opening schedule | Three historical dates (October 23–25), today (October 26), and six following dates through November 1; two validated successes per course |
| Local full-cap benchmark | 32–63 ms per opening course; first pair of reviewed replays including cold initialization 101 ms, subsequent pairs 8–16 ms |
| Real database integration | 2/2 passed: owned/idempotent starts, duplicate completion, forged score isolation, optimization/ties/percentiles, signed cursor tampering/viewer enforcement, future-date protection, closed daily/archive separation, committed receipt recovery, finality and cancellation |
| Full browser suite | 53/53 passed with a clean runner exit, including the unmocked daily test and existing editor/physics/accessibility/responsive regressions |
| Final focused UI/backend checks | Database 2/2; browser 4/4 after archive/practice/copy layout changes and bounded guest-body/cancellation refinements; Calendar fallback regression 1/1 after updating its practice-row selector |
| Editor and game production builds | Both passed |
| Actual built `next start` acceptance | 1/1 passed without HTTP interception: two guest cookies/nicknames, rotated setup, real solved playback, verified saves, refresh/readback, standings, copy fallback and three real historical courses solved after refresh |
| Production route boundary | `/` = 200, `/modal-preview` = 404, example rankings absent; see `production-route-smoke.json` |
| Native PNG review | Desktop and mobile inspected at original size; archive text and copy fallback reviewed after correction |
| Whitespace | `git diff --check` passed |

The earlier failed broad run mixed with a second Playwright run caused output-file collisions; independent runners were not used for the final full pass. A later archive assertion was corrected to expect the truthful outside-daily-window label. No result was reclassified to hide a test failure. Final source checks and production acceptance were run sequentially without active source edits.

## Evidence boundaries and release work

The new database and production-build browser checks use real local HTTP, PostgreSQL persistence and Rapier verification. Existing fixture browser tests remain fixtures; their ranks and guests are not production data. The separate final migration/schema comparison used another freshly created empty test database to confirm the checked-in SQL matches Prisma exactly.

The named Vercel site was inspected read-only and still served the preceding practice-fallback build. Vercel access was not connected in this session. No production database credential was requested or printed, and no production migration, publishing, merge or deployment was performed.

Required external acceptance remains:

1. Connect Vercel, confirm project/database configuration and publish/deploy the tested revision; validate real readback and runtime capacity there.
2. Establish the owner's schedule/availability checks and recovery operation on that environment, preserving any existing dated courses rather than silently replacing them.
3. Complete three uncoached human playtests, resolve blocking findings and record project-owner signoff.

The code is integrated and locally verified. Iteration 2 must not be described as production-accepted until those external items are complete. Optional bonus content, OAuth, payments and new mechanics are outside required scope. See [release instructions](../../docs/iteration-two-release.md).
