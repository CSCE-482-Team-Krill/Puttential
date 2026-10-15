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
   npm run db:seed
   ```

   Seeding uses today's **America/Chicago** date and the bundled Bar Around Corner course. It preserves an existing puzzle for that date. To provision an authored course for a specific day:

   ```sh
   npm run db:seed -- src/game/levels/authored/straight-forward.json 2026-10-15
   ```

   Provision each date you want to serve; puzzles are not generated automatically at midnight.

4. Start the frontend and API together:

   ```sh
   npm run game
   ```

   Open **http://127.0.0.1:3000**. There is no separate backend process: Next.js route handlers call `src/backend` services on the same origin. Check **http://127.0.0.1:3000/api/puzzles/today**; it should return today's date and canonical level configuration. Completed daily runs create attempts; successful runs also save the locked layout as replay commands. The UI reports save success or failure.

5. Optionally start the editor in a second terminal:

   ```sh
   npm run editor
   ```

   Open **http://127.0.0.1:3001**. See [the editor guide](level-editor/README.md). Courses save as canonical JSON with editor sidecars under `src/game/levels/authored/`. Use **Open local course** to playtest saved JSON, or seed that JSON as a daily course. The editor and practice/local-course play do not need a database; practice runs are not submitted.

For a production build, run `npm run game:build`, then `npm run game:start` with `DATABASE_URL` set. The frontend's `prebuild` step generates Prisma Client, including on clean CI checkouts. Apply `npm run db:migrate` to the deployment database and provision dated courses before serving players. `docker compose stop db` stops the local database and retains its data.

## Vercel deployment

Set the Vercel project's **Root Directory** to `src/frontend`, with **Next.js** as the framework. Enable **Include source files outside of the Root Directory in the Build Step** so the build can access the shared engine, backend, Prisma schema and root workspace dependencies. The former `ui_ux_research/design_c` directory is documentation only.

The checked-in `src/frontend/vercel.json` runs `npm run build`; its `prebuild` generates the ignored Prisma Client before Next.js compiles API routes. Use the root npm workspace lockfile and the default install command. Keep the Output Directory at its Next.js default (`.next`).

Set `DATABASE_URL` in Vercel's Preview and Production environments to the corresponding hosted PostgreSQL database. Builds do not require a live database; the API needs it at runtime. Run migrations and seed dated courses against that database separately, rather than modifying it during preview builds.

## Integration status

The Figma frontend, all six modal layouts, responsive styles, preferences and isolated `/modal-preview` route live in `src/frontend`. The game and editor share canvas drawing, controls and simulation hooks without duplicating physics.

The connected prototype exposes `GET /api/puzzles/today`, `POST /api/attempts` and `POST /api/solutions`. HTTP submissions support anonymous play only. Daily configuration is validated by the engine codec. Completed runs are saved once per visit; interrupted runs and unsent runs are not persisted or retried after a connection failure.

Profile, streak and leaderboard panels still display clearly labeled sample data. Calendar lists the daily course and bundled practice courses; historical database browsing and accounts are not implemented. The backend validates request structure and attempt/solution relationships but **still trusts client-reported success and scoring**; server-side replay verification and ranking remain future work.

## Source layout

- `src/frontend/app/`: Next.js pages, Figma styles and HTTP route handlers.
- `src/frontend/`: shared canvas, controls, icons, modals, API client and simulation hook; also the runnable frontend workspace.
- `src/backend/`: services, API types, request validation, Prisma integration and seed script.
- `src/game/`: framework-independent simulation, geometry, catalog and level codecs. See [the game API](src/game/README.md).
- `level-editor/`: desktop authoring UI, history and local save API.
- `ui_ux_research/`: research and independent A/B prototypes. Design C moved to `src/frontend`.

Run workspace commands from the repository root. The `db:*` scripts explicitly use `prisma7.config.ts`.

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

Browser tests start/reuse both apps. Frontend API tests mock HTTP responses so the suite can run without PostgreSQL. `npm run format` uses the repository Prettier configuration.
