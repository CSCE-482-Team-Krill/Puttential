# Repository Guidelines

## Project Structure & Assets

UI reference images live in `mock ui/`; research, a basic HTML sketch, and three Next.js/TypeScript mockups live in `ui_ux_research/`. `design_a/` uses the green palette and `design_b/` uses blue glass styling, and `design_c/` combines that glass styling with A’s green palette. Each has its page in `app/page.tsx` and styles in `app/globals.css`. `design_a/` and `design_b/` are static mockups with sample data. `design_c/` is the working frontend: it imports the game engine from `src/game/` through the `@game` alias, re-exports the shared course canvas and game loop from `src/frontend/`; its stats, leaderboard, and streak panels still use sample data. The deterministic Rapier engine lives in `src/game/` (see its README) and the backend in `src/backend/`. The desktop editor lives in `level-editor/` and saves canonical engine JSON plus editor metadata sidecars under `src/game/levels/authored/`. Both apps import shared drawing, controls, styles and simulation hooks from `src/frontend/`; never fork editor physics. Register new forces/shapes in `src/game/objects/catalog.ts` and `presets.ts` so the editor inherits them.

## Game Design Principles

Puttential is a web-first daily physics puzzle. Every player must receive the same dated course, ball and goal, surfaces, obstacles, tile inventory and magnitudes, and physics settings. Players place and rotate limited force tiles, press Play, and watch a locked, deterministic simulation. Make the basic goal easy to grasp while leaving room for multiple valid solutions. Prioritize predictable physics and readable feedback over extra mechanics. Rank successful solutions by force cost, then tile count, first-solve attempts, simulated completion time, and path length. Treat springs, magnets, strings, procedural generation, and weekly themes as later additions, after the core puzzle is fun and reliable.

## Development and Verification

Use Node 22.12+. Run `npm install` at the repository root for the Design C/editor workspaces. `npm run editor` starts 127.0.0.1:3001; `npm run game` starts 127.0.0.1:3000. Build with `npm run editor:build` and `npm run game:build`. Run `npm test` for codecs, bounds, history, persistence and Rapier equivalence; `npm run test:e2e` runs browser checks after `npx playwright install chromium`. Run `npx prisma generate --schema prisma/schema.prisma` when the backend client is absent, then `npm run typecheck`. A/B keep their independent install/dev/build commands. Inspect screenshots at native size and review `git diff --check`, `git diff --stat` and `git status --short`.

## Naming and Editing Conventions

Use descriptive, lowercase file names with hyphens, following the existing `puttential-ui-mockup-v2.png` pattern. Add a version suffix only when retaining an earlier design for comparison; otherwise update the relevant asset. Preserve PNG format for the existing mockups. Use the root Prettier configuration for new TypeScript/React code (`npm run format`).

## Testing Guidelines

Tests live in `tests/`: Node's test runner through tsx covers model/engine behavior, and Playwright covers desktop interactions. Verify existing-level round trips and identical Rapier replays in the same runtime when changing codecs or physics. Editor operations must reject geometry outside board bounds and preserve authored data across playtest. New force registration should supply serialization, palette and property controls automatically. Daily puzzle validation should confirm solvability and multiple practical solutions. Include before-and-after images when a pull request changes a mockup.

## Commits and Pull Requests

Recent commits use short, imperative descriptions such as `remove secrets` and `created mock ui v1 and v2`. Keep commit subjects brief and specific to the change. Pull requests should explain what changed, why it changed, and how it was checked; link a relevant issue when one exists. For visual changes, attach before-and-after images. Never commit credentials or private configuration.
