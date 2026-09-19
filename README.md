# Puttential frontend demo

This repository contains a frontend-only implementation of the revised Puttential game design. The playable sample, accounts, standings, authoring, and publication are local demonstrations. There is no backend API, authoritative validation, or physics engine.

## Run

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On Windows PowerShell installations that block `npm.ps1`, use `npm.cmd` in place of `npm`.

## Try the demo

- On **Today**, choose **Load sample layout**, then **Play demo run**. The scripted ball path ends in a local result and locks that puzzle on this device.
- Place any other legal layout to try the run, pause, change speed, and abort back to planning. There is no physics simulation for these layouts.
- Use **Archive** for past sample courses. A late solve does not receive an original daily rank.
- **Sign in** creates a labeled local demo identity. Provider and email controls contact no external service and do not verify or save credentials.
- **Leaderboard** contains sample entries. After a local solve, its UI unlocks sample playback and an example around-me standing.
- **Profile** shows local history. **Admin** creates and edits local course drafts, saves revisions, checks structure, and marks a draft locally published.
- **Settings** can clear all local demo data to start again.

Puzzle drafts, results, replay inputs, and admin drafts use IndexedDB. Small visual preferences use local storage. A browser without IndexedDB keeps state for the current tab only.

## Checks

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

The Next.js application is in `apps/web`. The typed service and simulation interfaces are in `src/lib/ports.ts`, with browser-only implementations in `src/lib/mock-services.ts`. Future backend and WASM integrations should replace those implementations while preserving the canonical puzzle and placement models.
