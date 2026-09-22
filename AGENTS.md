# Repository Guidelines

## Project Structure & Assets

UI reference images live in `mock ui/`; research, a basic HTML sketch, and two Next.js/TypeScript mockups live in `ui_ux_research/`. `design_a/` uses the green palette and `design_b/` uses blue glass styling. Each has its page in `app/page.tsx` and styles in `app/globals.css`. Both use sample data and have no backend or physics engine yet.

## Game Design Principles

Puttential is a web-first daily physics puzzle. Every player must receive the same dated course, ball and goal, surfaces, obstacles, tile inventory and magnitudes, and physics settings. Players place and rotate limited force tiles, press Play, and watch a locked, deterministic simulation. Make the basic goal easy to grasp while leaving room for multiple valid solutions. Prioritize predictable physics and readable feedback over extra mechanics. Rank successful solutions by force cost, then tile count, first-solve attempts, simulated completion time, and path length. Treat springs, magnets, strings, procedural generation, and weekly themes as later additions, after the core puzzle is fun and reliable.

## Development and Verification

From either `ui_ux_research/design_a/` or `ui_ux_research/design_b/`, run `npm install` to install dependencies, `npm run dev` to preview locally, and `npm run build` to compile and type-check. No automated test command is configured. Inspect image changes at native size and use `git diff --stat` and `git status --short` to review changes.

## Naming and Editing Conventions

Use descriptive, lowercase file names with hyphens, following the existing `puttential-ui-mockup-v2.png` pattern. Add a version suffix only when retaining an earlier design for comparison; otherwise update the relevant asset. Preserve PNG format for the existing mockups. For future code, follow the language's standard formatter and add its configuration to the repository rather than relying on undocumented local settings.

## Testing Guidelines

There is no automated test framework or coverage target. Visual inspection is the current verification method. For future features, test fixed-timestep determinism, collision and surface behavior, tile inventory limits, goal capture, and ranking order. Daily puzzle validation should confirm solvability and more than one practical solution. Include before-and-after images when a pull request changes a mockup.

## Commits and Pull Requests

Recent commits use short, imperative descriptions such as `remove secrets` and `created mock ui v1 and v2`. Keep commit subjects brief and specific to the change. Pull requests should explain what changed, why it changed, and how it was checked; link a relevant issue when one exists. For visual changes, attach before-and-after images. Never commit credentials or private configuration.
