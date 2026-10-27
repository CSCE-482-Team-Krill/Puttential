# Production backend connection

Verified October 27, 2026 (America/Chicago).

- Live site: https://puttential.vercel.app/
- Production deployment: https://vercel.com/puttential/puttential/5wspYPQuD9k2W5mgdb2w87N7C3Bf
- Deployed application revision: `1ff9942deb419cc5667eb6044d7e73ffc698c5ea`.
- Vercel deployment API confirmed `READY` and target `production`.
- The existing production `DATABASE_URL` remained a write-only secret. It was not revealed, copied, replaced or committed.
- Added Production Config `APP_ORIGIN=https://puttential.vercel.app`.
- Completed Vercel's required email reauthentication through its normal verification dialog.

## Release operation

The reviewed source was rebuilt for Production using a single-deployment install-command override. That command installed dependencies, required both `VERCEL_ENV=production` and the exact reviewed commit, generated Prisma Client, applied the checked-in additive migrations, published the validated course schedule and checked the next seven dates before the regular application build.

The deployment completed successfully. Project-level Install Command was checked afterward and remained `cd ../.. && npm ci`; the release override was not installed as the normal project command. Preview builds and later ordinary builds do not run this release preparation automatically. Existing dated courses were preserved by the publishing command.

This is a manual production release from `iteration-2-frontend-final`. The Git production branch remains `main`; merge the reviewed integration before the next main-branch deployment to retain the delivered backend and leaderboard behavior.

## Live verification

Verification used an isolated browser guest against the actual public site, without HTTP interception or fixture responses.

| Check | Result |
| --- | --- |
| Daily course | HTTP 200; October 27 course `South Lawn`, with published rules and compatible simulation version |
| Guest bootstrap | Cookie established; GET me returned HTTP 200; identity survived a full page refresh |
| Server replay and persistence | One all-forces-disabled run returned HTTP 200, state `saved`, outcome `stopped`, verification `verified` |
| Authoritative metrics | Force cost 0, tile count 0, path length 0, terminal tick 62 |
| Completion retry | Same run returned HTTP 200; accepted-start count remained 1 |
| Saved run readback | GET run returned HTTP 200 and the verified stored result |
| Archive | HTTP 200; October 24, 25, 26 and 27 entries available; future courses excluded from the list |
| Daily leaderboard API | HTTP 200; current viewer matched the authenticated guest |
| Leaderboard UI | Loaded normally and truthfully showed 0 ranked players and “No verified results yet” |
| Browser runtime | No page errors in the verification browser |

Public verification references: puzzle `d39d42ba-379f-441c-892a-c9f9ae3e529f`; run `4e07d15a-6cf6-4d38-bdf5-8efa024f3c93`. These are opaque record identifiers, not authentication credentials.

The smoke run deliberately did not solve the course, so it did not create an artificial ranked player. A real verified successful solve will populate the leaderboard. Screenshots are `daily-course.png` and `leaderboard.png` in this directory and were reviewed at original size.

The tested application's [CI run](https://github.com/CSCE-482-Team-Krill/Puttential/actions/runs/40446397910) passed 64 unit tests, 2 real-database integration tests and 53 browser tests, plus builds and production route checks. Those tests remain separate from this live record. Additional successful production ranking/optimization/tie scenarios, ongoing operational monitoring and the three uncoached human playtests still need acceptance; this record closes the production connection and basic persistence checks.
