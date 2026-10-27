# UI polish review package

Implementation stage: **complete — ready for review**.
Overall verification: **blocked on existing Windows test/format issues and human review**, not merge-approved.

Checks performed 2026-10-20 on Windows, Node v24.19.0, Next.js 16.3.6 and the installed Playwright Chromium. No remote push, PR, merge or deployment was performed.

## Commands and actual results

| Command | Result | Evidence / limitation |
| --- | --- | --- |
| `npm.cmd install` | PASS | Existing workspace lockfile resolves; no dependency upgrade. |
| `npm.cmd run db:generate` | PASS | Prisma Client 7.10.0 generated; also runs in frontend prebuild. |
| `npm.cmd run typecheck` | PASS | Root `tsc --noEmit`, including final renderer changes. |
| `npm.cmd test` | FAIL, preexisting environment issue | 16/17 pass. `tests/level-editor.test.ts:376` cannot create a Windows symlink (`EPERM`). Baseline was 15/16 with the identical failure. An outside-sandbox rerun also fails at that same symlink. No existing assertion was skipped or weakened. |
| `npm.cmd run test:e2e` / final JSON-reporter run | PASS | All **33** browser tests pass: 8 original frontend/editor tests plus 25 UI-polish tests. Final run: 60.7s, zero skipped/flaky/unexpected cases. [Full results](browser-results.json). |
| Targeted final contrast/resize/import reruns | PASS | Contrast 1/1, resize/import 3/3 after the final test refinements and screenshot additions. |
| `npm.cmd run game:build` | PASS | Final optimized frontend build, including Prisma prebuild. |
| `npm.cmd run editor:build` | PASS | Final optimized editor build with shared canvas cancellation fix. |
| `npm.cmd run test:ui:production` | PASS | Real built `next start` on port 3002: home 200, preview 404, no example rankings in preview response. See [production-route-smoke.json](production-route-smoke.json). |
| `npx.cmd prettier --check src/frontend tests` | FAIL, unchanged files | Existing formatting in `src/frontend/app/layout.tsx`, generated `src/frontend/next-env.d.ts`, and `tests/editor.spec.ts`. These were not reformatted as collateral. |
| Prettier check on all changed/new source and test files | PASS | Includes CSS, pages, renderer, controls, modal, helper, fixtures, UI tests and production smoke script. |
| `git diff --check` | PASS | No whitespace errors. |
| Live PostgreSQL migration/seed/API integration | NOT RUN | No local PostgreSQL service. Browser tests use deterministic same-origin API mocks; production HTML smoke does not assert database connectivity. Setup commands are in the root README. |

Incidental editor test screenshots and generated Next route imports were restored to their starting content. Engine, backend, Prisma schema, authored courses and editor source are unchanged.

## Browser cases and visual evidence

Fixture ID/date/seed: `ui-polish-daily` / `2026-10-15` / `ui-polish-fixed`. Inventory and pointer fixtures are defined in [tests/ui-polish-fixtures.ts](../../tests/ui-polish-fixtures.ts). They are test-only data and never enter the production catalog. Screenshots use scale 1, en-US, America/Chicago and explicit local preferences/reduced motion. After screenshots hide Next's development tools indicator only during capture.

| Case | Fixture / viewport | Actual result | Evidence |
| --- | --- | --- | --- |
| Branded loading → success/503 | Single inventory; 320×720, 390×844, 1440×900 | PASS | No fake game controls; practice fallback replaces loading. |
| Desktop topology and tall-toolkit stability | 0/3/12/long inventories; 1440×900 | PASS | All four joined-region gaps remain **0px**, independent of tray height; normal page scroll. [Measurements](desktop-track-measurements.json), [long inventory](inventory-12-long.png). |
| Inventory/ON state/cost/disabled text | Two fields, one initially ON | PASS | 1/2 → 2/2; 1pt → 2pt; disabled ON state stays visible with opacity 1. |
| Mobile ON → drag field → Play | Single field; 320×720, 390×844, 390×667 | PASS | Unique title precedes course; toolkit starts 12px after controls; card follows heading by 12px. [320](after-mobile-320x720.png), [390 short](after-mobile-390x667.png). |
| Width sweep and header geometry | 320/390/700/760/850/959/960/961/1050/1440/1920 | PASS | No horizontal page overflow; five direct ≥40px targets; original desktop centering/right-edge assertions retained. [959](near-breakpoint-959.png), [960](near-breakpoint-960.png). |
| Actual field displacement/bounds | Pointer-only; 390/959/960/1050/1440 | PASS | Canvas white-outline raster sampling within 2px; old edge disappears; bottom-bound clamping checked without requiring a solution. [Before](pointer-390-before.png), [after](pointer-390-after.png). |
| Completed move + fresh drag after resize | Pointer-only; 959→960→959 | PASS | Same canvas, file input, Play, tray and card nodes; focus, position and attempts retained. |
| Held-pointer resize (separate case) | Pointer-only; both 959↔960 directions | PASS after approved fix | Safe cancellation preserves the committed position after another physical pointer move, then allows a fresh drag. [959 fixed](active-drag-959-fixed.png), [960 fixed](active-drag-960-fixed.png). See approval/reproduction in [implementation notes](implementation-notes.md). |
| Running and pending-save resize | Known success fixture, 959↔960 | PASS | Attempt count and mounted nodes retained; exactly one attempt then one solution, with exact quantized default placement commands. [Success](result-success.png). |
| Failed run, close versus retry, save error | Original deterministic stopped layout | PASS | No solution POST; error remains honest; close leaves run locked, Try again restores setup. [Failure](result-failure.png). |
| Five modal partitions and honest data | Main game plus development preview | PASS | [Help](modals-help.png), [Profile](modals-profile.png), [production leaderboard](modals-leaderboard-unavailable-production.png), [Calendar](modals-calendar.png), [Settings](modals-settings.png). |
| Preview boundary | Development and built production | PASS | [Six neutral example rows](modals-leaderboard-six-example-rows-preview.png), [fixture banner](preview-fixture-label.png), production HTTP 404. |
| Short-dialog scrolling/focus/persistence | 320×568 | PASS | Expanded Help scrolls inside dialog; bidirectional Tab trap, backdrop/Escape close, focus restoration and saved settings verified. Fixed flex shrinking that otherwise clipped expanded sections. |
| Import validation, pending resize, camera | Corrupt, >2MB and valid alternate-bounds editor JSON | PASS | One file input remains mounted across resize; one file read; inline errors; imported camera bounds respected; no local-run submission. |
| Zoom-equivalent reflow and enlarged text | Effective 640/320/256 CSS px, root font enlarged to 20px | PASS | No page overflow; Play → tray → secondary actions tab order. This is effective-layout testing, not a claim of native browser-chrome zoom review. |
| Native browser zoom / uncoached first-time player | Human 200%/400% and touch review | NOT RUN | Remains part of human acceptance below. |
| Rendered contrast and reduced motion | Default/hover/ON/disabled/warning/focus/modal/switch states | PASS | [Measured contrast table](contrast-audit.md). OS and saved motion settings tested without freezing simulation. |
| Renderer colors / hazards / portals | Current branch supports no water/lava/portal fields | NOT APPLICABLE | No canvas paint constants or textures changed; no claim of unsupported category coverage. |
| Mixed selectable/course object | Current branch has no course-object type/export | NOT APPLICABLE | All supported fields are selectable. Helper tests reject unrelated draft IDs from displayed counts. Source reconciliation is documented. |
| Existing editor interactions and replay tests | Original editor and frontend suites | PASS | All 8 original browser cases remain passing. Unit Rapier equivalence tests pass; the separate filesystem symlink case remains blocked. |

## Before / after and Figma review

- Desktop: [before](before-desktop-1440x900.png) → [after](after-desktop-1440x900.png); [1920 after](after-desktop-1920x1080.png).
- Mobile: [before](before-mobile-390x844.png) → [after](after-mobile-390x844.png).
- Package references: [desktop](references/figma-desktop.png), [five modals](references/figma-modals.png). Native dimensions and package SHA-256 matches were checked before implementation.

Agent self-review: the wide header, dominant upper-left course, lower-left scorecard and right tray preserve the screenshot topology. Help/Profile/Leaderboard preview/Calendar/Settings retain the specified vertical partitions. Screenshot colors were placeholders; the exact approved paper/turf tokens are implemented. This assessment is **not human approval**, editable Figma inspection or automated Figma synchronization.

## Human acceptance still required

Reviewer name/role: pending. Decision timestamp: pending. Decision: **not yet reviewed**.

Record APPROVED or CHANGES REQUESTED with evidence and a 1–5 score for desktop Figma fidelity, mobile gameplay flow, game-first hierarchy, distinctive identity, typography/readability, honesty of data, modal consistency and regression evidence. The supplied package requires ≥4 in every category and explicit combined approval. Also run the uncoached single-field ON → canvas drag → Play comprehension check and native zoom/touch review. Do not mark this package merge-approved before these checks and existing mandatory test issues are resolved.

Known gameplay limitation: keyboard-only users can reach cards and ordinary controls but cannot position their fields with the current pointer-only renderer. Enabling multiple similar fields does not add a unique focus/card highlight on the canvas; neither capability is claimed by this polish.
