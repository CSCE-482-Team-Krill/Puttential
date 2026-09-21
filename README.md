# Puttential

## Run the example

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Drag the fixed lift field into position and press **Run**. The dotted line shows the core's deterministic prediction for the current setup.

## Frontend integration note

The game core lives at `src/game/` and is intentionally independent of any UI framework, so a future `src/frontend/` can be added alongside it without changing the core.

If the frontend arrives from another branch or scaffold, carefully merge the root `package.json`, `package-lock.json`, `tsconfig.json`, and `vitest.config.ts` instead of replacing either side. Keep one root package and one root lockfile, preserve both sets of scripts and dependencies, then run `npm install` once from this directory. Frontend code should import the core through `src/game/index.ts` (or the package subpath `puttential/game` once the chosen frontend tool is configured to resolve the package export).
