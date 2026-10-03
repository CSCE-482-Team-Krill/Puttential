# Repository Guidelines

## Project Structure & Assets

UI reference images live in `mock ui/`; research, a basic HTML sketch, and three Next.js/TypeScript mockups live in `ui_ux_research/`. `design_a/` uses the green palette and `design_b/` uses blue glass styling, and `design_c/` combines that glass styling with A’s green palette. Each has its page in `app/page.tsx` and styles in `app/globals.css`. `design_a/` and `design_b/` are static mockups with sample data. `design_c/` is the working frontend: it imports the game engine from `src/game/` through the `@game` alias, draws the course on a canvas (`app/course-canvas.tsx`), and runs the game loop in `app/puzzle.ts`; its stats, leaderboard, and streak panels still use sample data. The deterministic game engine lives in `src/game/` (see its README) and the backend in `src/backend/`.

## Game Design Principles

Puttential is a web-first daily physics puzzle. Every player must receive the same dated course, ball and goal, surfaces, obstacles, tile inventory and magnitudes, and physics settings. Players place and rotate limited force tiles, press Play, and watch a locked, deterministic simulation. Make the basic goal easy to grasp while leaving room for multiple valid solutions. Prioritize predictable physics and readable feedback over extra mechanics. Rank successful solutions by force cost, then tile count, first-solve attempts, simulated completion time, and path length. Treat springs, magnets, strings, procedural generation, and weekly themes as later additions, after the core puzzle is fun and reliable.

## Level Format

Levels are plain JSON with no code in them, so they can be loaded from a file, the `Puzzle.configuration` database column, or a future level editor without being bundled with the engine. The format is defined by the `Level` type in `src/game/levels/types.ts`; the sample levels are the `.json` files beside it. `design_c/app/levels.ts` imports those files and passes each through `parseLevel`. `src/game/README.md` has the full reference.

A level has `formatVersion` (currently `1`), `id`, `name`, `gravity`, `dynamicBodies`, `staticBodies`, `fields`, and `goal`. Bodies are made of `pieces`; each piece and each field has a `shape` in its owner's local frame: `{ kind: 'rectangle', width, height }`, `{ kind: 'polygon', points }`, or, for body pieces only, `{ kind: 'circle', radius }`. Piece shapes must be convex and polygon pieces counter-clockwise; field polygons may be concave. Each field has a `force` selected by `kind` (`uniform`, `attractor`, `repulsor`, `vortex`, or `drag`). The `goal` names a dynamic body, an axis-aligned `area` box, and `holdSeconds`; the engine tracks it every tick and reports progress in the render state. Bodies and fields share one ID namespace. Raise `formatVersion` only when existing files stop meaning the same thing.

Keep behavior out of level files. Anything a level needs the engine to do is named by a `kind` string in the data and implemented in the engine: force laws in `src/game/objects/forces.ts`, shape outlines in `src/game/geometry/shapes.ts`, and colliders in `src/game/objects/bodies.ts`.

## Level Parser

`parseLevel(data: unknown)` in `src/game/levels/parse.ts` is the only way data becomes a `Level`, and `createGame` runs it on every level it receives. It is a set of small hand-written `read*` functions, one per part of the format, with no schema library. Each takes a value and its path, checks the type and range, and returns a fresh object, so the result contains only known properties in a fixed order and `JSON.stringify(parseLevel(data))` is the canonical way to write a level. Errors are thrown for the first problem found and name its path, such as `level.fields[0].shape.width must be positive`.

The parser rejects unknown properties and unknown `kind` values instead of ignoring them. This is deliberate: an engine that does not know a mechanic must refuse the level, not simulate a different puzzle from the one other players get. It also checks rules that span properties: unique IDs, valid polygons, a radial force's source inside its field, and a goal that names a dynamic body.

To extend the format, change `types.ts` and `parse.ts` together, then add the behavior to the engine. A new force or shape is another `kind` in the existing union; a new sort of object, such as a joint or trigger, is a new optional top-level array whose entries have an `id` and a `kind`. Additions like these keep existing level files valid and do not change `formatVersion`.

## Development and Verification

From `ui_ux_research/design_a/`, `design_b/`, or `design_c/`, run `npm install` to install dependencies, `npm run dev` to preview locally, and `npm run build` to compile and type-check. `design_c/` also needs `npm install` at the repository root, where the engine's Rapier dependency lives. Type-check the engine with `npx tsc --noEmit` from the repository root. No automated test command is configured. Inspect image changes at native size and use `git diff --stat` and `git status --short` to review changes.

## Naming and Editing Conventions

Use descriptive, lowercase file names with hyphens, following the existing `puttential-ui-mockup-v2.png` pattern. Add a version suffix only when retaining an earlier design for comparison; otherwise update the relevant asset. Preserve PNG format for the existing mockups. For future code, follow the language's standard formatter and add its configuration to the repository rather than relying on undocumented local settings.

## Testing Guidelines

There is no automated test framework or coverage target. Visual inspection is the current verification method. For future features, test fixed-timestep determinism, collision and surface behavior, tile inventory limits, goal capture, and ranking order. Daily puzzle validation should confirm solvability and more than one practical solution. Include before-and-after images when a pull request changes a mockup.

## Commits and Pull Requests

Recent commits use short, imperative descriptions such as `remove secrets` and `created mock ui v1 and v2`. Keep commit subjects brief and specific to the change. Pull requests should explain what changed, why it changed, and how it was checked; link a relevant issue when one exists. For visual changes, attach before-and-after images. Never commit credentials or private configuration.
