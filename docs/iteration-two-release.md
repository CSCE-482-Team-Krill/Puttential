# Iteration 2 release and publishing

Production target: https://puttential.vercel.app/. Daily publishing owner: the project owner (confirmed October 26, 2026). The earlier implementation plan and handoff are historical planning documents; the shared revision 3.1 code and this guide describe delivery.

## Release

1. Configure Vercel with root `src/frontend`, include source files outside that directory, and use the existing root workspace lockfile. Keep preview and production databases separate.
2. Set private `DATABASE_URL` and exact `APP_ORIGIN` (`https://puttential.vercel.app` in Production). Preview needs its own exact origin. Cookie authentication uses a random 256-bit HttpOnly session with a server-stored hash and one-year expiry; production cookies are Secure and SameSite=Lax.
3. Run `npm run db:generate` and `npm run db:migrate` with the intended database configuration. The competitive migration adds tables and nullable puzzle metadata; legacy data stays intact. Builds never migrate or publish data.
4. Run `npm run courses:publish -- schedule`, then `npm run courses:publish -- check`. This validates and provisions three historical dates, today and the following six days. Existing dates are never overwritten. An existing legacy course without reviewed rules is reported and must be reviewed explicitly; it is never silently replaced.
5. Run `npm run game:build` and deploy the tested revision. The competitive catch-all uses Node with a 30-second function duration. Perform the live acceptance below before declaring the milestone accepted.

The server keeps the cursor signing key in `service_settings`, so cursors survive process restarts and cannot be forged by changing base64 JSON. Vercel guest admission uses its trusted `x-vercel-forwarded-for` header; see [request headers](https://vercel.com/docs/headers/request-headers). Other hosting must put a trusted admission limit in front of guest creation before broad public rollout.

## Daily publishing

Run the schedule check before each Central midnight and keep at least seven dates ready. Calendar boundaries use `America/Chicago`, including 23- and 25-hour DST days. The opening set is deliberately simple and authored; there is no procedural generation or new physics mechanic.

For a custom course, prepare a private review JSON containing `title`, canonical `configuration`, `rules`, and at least two different canonical `solutions` (Placement envelopes). The configuration is the same JSON the editor saves; API metadata stays outside it. Rules specify the supported simulation/rules versions, positive costs for exactly the selectable inventory, placement bounds, rotation and a cap of 1–7,200 ticks. Produce solution placements with `makePlacement` from `src/game/run-evaluation.ts`.

```sh
npm run courses:publish -- course path/to/reviewed-course.json YYYY-MM-DD
npm run courses:publish -- check
```

Publishing validates both successes and a full 7,200-tick (or published smaller cap) run with every tile active. Limits are 32 dynamic bodies, 128 static bodies, 256 fields and 128 KiB canonical JSON. Two reviewed replays must finish within five seconds total, and the full-cap benchmark within three seconds on the publishing machine. These are admission gates, not a promise of identical hardware performance; repeat the benchmark on the intended hosting runtime. Author solutions and benchmark data stay private in the database.

Do not change a published course after play begins. If it is broken, cancel it with a public reason:

```sh
npm run courses:publish -- cancel YYYY-MM-DD "Reason shown to players"
```

Cancellation removes ranking claims while retaining historical verification. Publish corrected content under a new unused date; never rewrite old standings.

## Recovery and capacity

Accepted starts and immutable completion receipts are separate committed transactions. The receipt captures server time and daily qualification before replay. Replay runs outside the transaction; result, progress, first-solve and best scores commit atomically under the same puzzle lock used for starts, receipts, cancellation and board snapshots. Rankings use force cost, tile count, frozen first-solve ordinal, terminal tick and quantized path length, with competition ties.

The database admits two concurrent verification leases across replicas, expiring after 30 seconds. Reads and identical completion retries can recover expired leases. Three infrastructure failures leave the receipt blocked for the publishing owner; they never turn it into a rejected player result or remove daily eligibility. The owner should check and recover after an outage:

```sh
npm run courses:publish -- recover
```

Run recovery in a scheduled operator job as well as after an outage when unattended finalization is required. Each invocation handles up to 100 processing records; repeat until the backlog is clear. This command also removes expired guest-admission counters. Keep production database backups; do not delete active guest sessions or run receipts. Losing a browser cookie loses guest access; cross-device recovery and OAuth are outside iteration 2.

Interactive bodies are bounded to 256 KiB. A guest may start 30 runs/minute; Vercel permits 30 new guest sessions/IP/hour. Reads expose ranks and metrics, not layouts or authentication secrets. The legacy attempt/solution routes do not write competitive standings.

## Verification

Use a disposable local PostgreSQL database with a name containing `test` or `iteration_two`. Set both `DATABASE_URL` and `TEST_DATABASE_URL` to it, migrate, publish the opening schedule, then run:

```sh
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run editor:build
npm run game:build
npm run test:ui:production
```

The database suite rejects nonlocal or unnamed database targets. The unmocked browser test requires `TEST_DATABASE_URL`; its servers must use the matching `DATABASE_URL`. CI provisions PostgreSQL and runs both suites. On Windows without symlink privilege, only the separate symlink-security test is explicitly skipped; Linux CI runs it. Builds and browser tests must run sequentially against a workspace, and multiple Playwright runs need separate output directories.

## Remaining production acceptance

Production was connected and deployed on October 27, 2026. The [live connection record](../artifacts/production-backend/verification.md) documents the reviewed source revision, additive migration and publishing release, guest persistence, verified replay readback, archive and working leaderboard UI. Standard project install/build settings remain unchanged; the initial release used an explicit production-and-commit-guarded, single-deployment install override to use the existing write-only database secret.

- Exercise additional successful live solves, two ranked guests, optimization/ties, copy text and outage recovery on the named Vercel project. The connection smoke run was a verified non-success and did not populate production rankings.
- Confirm the hosting replay benchmark, capacity and scheduled recovery/availability monitoring in that environment.
- Have three uncoached people complete the core flow, resolve any blocking findings and record project-owner acceptance.

Local integrated checks are documented in [the completion evidence](../artifacts/iteration-two-completion/verification.md). They do not substitute for production or human acceptance. OAuth, payments, new physics systems, generated daily courses and optional bonus content remain outside this release.
