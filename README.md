# Puttential

A daily physics puzzle with a shared Rapier engine, a working Next.js frontend (Design C), and a local level editor.

## Run locally

With Node 22.12 or newer, from this directory:

```sh
npm install
npm run editor
```

The editor opens at **http://127.0.0.1:3001**. Run `npm run game` in another terminal for Design C at **http://127.0.0.1:3000**. Neither needs a database for local editing/playtesting.

See [the editor guide](level-editor/README.md) for geometry tools, saving, controls and extending the object catalog. Courses save into `src/game/levels/authored/` as game-ready JSON plus a separate `.editor.json` metadata file. Design C's **Open local course** reads the same JSON.

## Shared code

- `src/game/`: framework-independent simulation, geometry, objects and level codecs. See [the game API](src/game/README.md).
- `src/frontend/`: Design C's canvas, styles, icons, player controls and simulation hook, consumed by both apps.
- `level-editor/`: desktop authoring UI, document history and local save API.
- `ui_ux_research/design_c/`: working game frontend; A/B remain independent static prototypes.
- `src/backend/`: backend services and Prisma integration.

Design C and the editor are npm workspaces with one root dependency lock. Preserve engine/backend dependencies when changing packages. The engine imports no frontend code. Change shared components at their common source instead of copying them into an app.

## Checks

```sh
npm test
npm run editor:build
npm run game:build
npx prisma generate --schema prisma/schema.prisma
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Prisma generation supplies backend types for the full repository check. Browser tests start/reuse both local apps. `npm run format` uses the repository Prettier configuration.
