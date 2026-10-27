# Puttential

A daily physics puzzle with a Next.js frontend, PostgreSQL/Prisma backend, shared deterministic Rapier engine and local level editor.

## Stand up the full stack

Use **Node 22.12+** and **PostgreSQL 17** (or Docker Desktop). Run commands from the repository root. In Windows PowerShell, use `npm.cmd` / `npx.cmd` if the execution policy blocks `npm` / `npx`.

1. Install the workspaces and create local configuration:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

   On macOS/Linux use `cp .env.example .env`. Keep `.env` at the repository root. Both Next.js and Prisma commands load it; `DATABASE_URL` stays on the server.

2. Start PostgreSQL. With Docker Desktop running:

   ```sh
   docker compose up -d --wait db
   ```

   This creates a local database using the development credentials in `.env.example` and persists it in a Docker volume. If port 5432 is already used, change the host port in `compose.yaml` and `.env`, or use your existing PostgreSQL instance: create a `puttential` database and set `DATABASE_URL` to its connection string.

3. Generate the client, apply checked-in migrations and provision today's course:

   ```sh
   npm run db:generate
   npm run db:migrate
   npm run courses:publish -- schedule
   npm run courses:publish -- check
   ```

   Publishing provisions today, the following six days, and three historical dates. Each opening course must pass two distinct successful server replays and a full-cap performance check. Existing dates are preserved. You own daily course publishing; run the schedule check before the next Central midnight. See [the publishing guide](docs/iteration-two-release.md) for custom courses, recovery and cancellation.

4. Start the frontend and API together:

   ```sh
   npm run game
   ```

   Open **http://127.0.0.1:3000**. There is no separate backend process: Next.js route handlers call `src/backend` services on the same origin. Check **http://127.0.0.1:3000/api/puzzles/today** for the published dated course and rules. Guest sessions, server-replayed results, progress, archive, leaderboard and sharing use the same-origin API.

5. Optionally start the editor in a second terminal:

   ```sh
   npm run editor
   ```

   Open **http://127.0.0.1:3001**. See [the editor guide](level-editor/README.md). Courses save as canonical JSON with editor sidecars under `src/game/levels/authored/`. Use **Open local course** to playtest saved JSON, or publish it with two reviewed solutions as a daily course. The editor and practice/local-course play do not need a database; practice runs are not submitted.

For a production build, run `npm run game:build`, then `npm run game:start` with `DATABASE_URL` set. The frontend's `prebuild` step generates Prisma Client, including on clean CI checkouts. Apply `npm run db:migrate` to the deployment database and provision dated courses before serving players. `docker compose stop db` stops the local database and retains its data.

## Vercel deployment

Set the Vercel project's **Root Directory** to `src/frontend`, with **Next.js** as the framework. Enable **Include source files outside of the Root Directory in the Build Step** so the build can access the shared engine, backend, Prisma schema and root workspace dependencies.

The checked-in `src/frontend/vercel.json` runs `npm run build`; its `prebuild` generates the ignored Prisma Client before Next.js compiles API routes. Use the root npm workspace lockfile and the default install command. Keep the Output Directory at its Next.js default (`.next`).

Set `DATABASE_URL` in Vercel's Preview and Production environments to separate hosted PostgreSQL databases. Set `APP_ORIGIN=https://puttential.vercel.app` in Production, and the corresponding exact preview origin in Preview. Builds do not require a live database; the API needs it at runtime. Run migrations and seed dated courses against that database separately, rather than modifying it during preview builds.

## Frontend polish and local design review

The game uses the Little Putting Club paper/turf theme from the v1.2.1 package. One mounted canvas and one set of controls adapt with CSS: desktop keeps the course and scorecard left of the toolkit; mobile puts the title before the course, then Play, toolkit and secondary actions. The editor retains its existing styles and engine.

For frontend-only review (no database required), run from the repository root in Windows PowerShell:

```powershell
node --version # 22.12 or newer
npm.cmd install
npm.cmd run db:generate
npm.cmd run game
```

Open **http://127.0.0.1:3000**. Without PostgreSQL the game shows an unavailable-daily notice and offers the bundled practice courses. Use **Open local course** below the game controls for editor JSON. Practice/local runs are not saved. To serve and save today's actual daily course, follow the full-stack setup above; preserve your existing `.env` rather than overwriting it. If creating it for the first time:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --wait db
npm.cmd run db:migrate
npm.cmd run courses:publish -- schedule
npm.cmd run game
```

**http://127.0.0.1:3000/modal-preview** is a development-only review page, with clearly labeled example courses and six example leaderboard rows. It returns **404 in production**. The real Profile and Leaderboard use persisted guest progress and verified results. Settings persist on this device; audio preferences are not connected to playback.

For a production preview, stop the development server with Ctrl+C, then:

```powershell
npm.cmd run game:build
npm.cmd run game:start
```

UI regression and production route checks:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
# Stop next dev before building/starting against the same workspace.
npm.cmd run game:build
npm.cmd run test:ui:production
```

The production smoke script temporarily serves the built app on **127.0.0.1:3002**, checks `/` is 200 and `/modal-preview` is 404, then stops its server. Tests recreate review evidence under `artifacts/`; earlier captures and verification records remain available in Git history. Browser tests intercept API calls and do not prove database integration. Select a toolkit tile to edit X/Y without a pointer; rotation requires E0.

## Integration status

The browser, editor and server use one Rapier engine. The daily API persists opaque cookie-authenticated guests, accepted starts and immutable completion receipts. Server replay computes the outcome and score; client-reported success and metrics cannot enter competitive standings. Daily eligibility requires both start and receipt within the original Central date. Archive solves remain available after daily closure.

The shared engine supports absolute tile rotation at 0.1-degree increments, complete canonical setup at tick zero, finite runs, shared goal/failure evaluation and path length excluding teleport jumps. The frontend retains drafts and pending submissions, retries the same request IDs, and keeps practice unranked.

Daily/archive standings use competition ties, strictly-worse percentiles, Top and Around me, and signed viewer-bound pagination. A committed eligible receipt keeps a closed daily board provisional until verification finishes. Expiring worker leases and the publisher recovery command handle interrupted verification.

The older attempt/solution prototype endpoints remain unranked and isolated from competitive tables. The development modal preview still uses labeled examples and returns 404 in production.

[Release instructions and remaining production acceptance](docs/iteration-two-release.md) distinguish local integrated evidence from live deployment and human playtesting.

## Source layout

- `src/frontend/app/`: Next.js pages, Figma styles and HTTP route handlers.
- `src/frontend/`: shared canvas, controls, icons, modals, API client and simulation hook; also the runnable frontend workspace.
- `src/backend/`: services, API types, request validation, Prisma integration and seed script.
- `src/game/`: framework-independent simulation, geometry, catalog and level codecs. See [the game API](src/game/README.md).
- `level-editor/`: desktop authoring UI, history and local save API.
- `scripts/`: logo generation tools. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-logo.ps1` on Windows, then `node scripts/render-logo.mjs` for raster exports and proof sheets under `artifacts/logo/`.

Run workspace commands from the repository root. `db:generate` and `db:migrate` use `prisma7.config.ts`; `db:seed` publishes the reviewed opening schedule.

## Verification

```sh
npm run db:generate
npm run typecheck
npm test
npm run editor:build
npm run game:build
npx playwright install chromium
npm run test:e2e
```

Browser tests start/reuse both apps. Most UI regressions intercept HTTP; the unmocked daily browser test requires `TEST_DATABASE_URL` and servers using the matching `DATABASE_URL`. Run `npm run test:integration` against a disposable migrated and provisioned PostgreSQL database; CI provides one. `npm run format` uses the repository Prettier configuration.
