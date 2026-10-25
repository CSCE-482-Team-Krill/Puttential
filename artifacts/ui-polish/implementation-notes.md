# UI polish v1.2.1 implementation notes

Requested package: `Puttential_UI_Polish_v1.2.1_Complete_Package.zip`, inspected 2026-10-20.
Local implementation branch: `frontend-polish`, starting at `d90b61a1c98070e40bae3e310e45fc4033eba59d` with a clean worktree.
Historical audit: `0176e8b0a112bf33621e40c52aa541c1139725b1`.

## Source and reference reconciliation

Both PNGs were decoded and inspected at native size: desktop 1024×760; modals 673×321. SHA-256 matches the package manifest for both images and the specification. These are screenshot references; no editable Figma source was supplied.

This branch predates the audit's course-object, hazard/portal and timing additions. Its `FieldForceDefinition` supports only uniform, attractor and repulsor forces, and every `Level.fields` entry is selectable. There is no `isCourseObject` export. The shared UI helper therefore uses the actual field inventory, ignores unrelated draft IDs and never adds unsupported forces or imports engine changes. A mixed selectable/course-object fixture is inapplicable to this branch. No engine, backend, editor, physics, coordinate mapping or persistence changes are included. The separately approved renderer cancellation fix is described below.

## CSS ownership ledger (recorded before UI edits)

| Selectors | Previous definitions / cascade | Final owner |
| --- | --- | --- |
| html, body, buttons, tokens | `game.css` lines 1–32, 1147–1165, 1899 onward; `globals.css` lines 1–40 | Frontend `globals.css`; shared editor stylesheet unchanged |
| site-wrap, site-header, dashboard, brand, nav-button | Multiple legacy/glass/media layers in `game.css`; frontend overrides at `globals.css` 44–180 and 1056–1360 | One frontend declaration per responsibility, explicit responsive media blocks |
| game-layout, course, course-grid, course-canvas | `game.css` 194–270, 1358–1388, 1940+, 1974+; frontend 182–274 and media rules | Frontend standalone layout and canvas positioning |
| course-details, control-column | Frontend 276–314, 459–497 and media rules; legacy control-column 456+ | Frontend: connected identity/primary/secondary slots; course-details retained for preview |
| tile-option, tile-arrows, tile-info, tile-cost | `game.css` 474–534, 1482+, 1997+; frontend 499–579 and media rules | Frontend states, wrapping and cost badges |
| primary-button, text-button, how-button | `game.css` 178+, 550+, 1293+, 1524+, 1928+, 2003+; frontend 316–414 | Frontend controls and explicit disabled/focus states |
| modal, modal-row, dialogs, switches | Shared legacy 666–956, 1604–1752; frontend 628–1054 | Frontend modal chrome and partitions |
| local-level-import | `game.css` 2020+; no frontend owner | Frontend secondary-action layout and inline errors |
| new course-meta, course-identity, primary-controls, secondary-course-actions | New display-only siblings | Frontend CSS Grid areas; no viewport state or duplicate components |

`level-editor/app/globals.css` imports `game.css` directly. All live frontend elements have complete rules in the replacement `globals.css`, so its redundant `game.css` import can be removed: this also removes inherited glass pseudo-elements, old media rules and animations rather than piling overrides on them. The shared editor stylesheet stays byte-for-byte unchanged. Noto Sans has one optional runtime import, with local fallbacks and no build font fetch.

## Baseline environment and checks

Windows / PowerShell; Node v24.19.0. Use `npm.cmd`/`npx.cmd` because PowerShell execution policy blocks the `.ps1` shims.

- Prisma generation: PASS.
- Root typecheck: PASS.
- Frontend and editor production builds: PASS.
- Unit tests: 15 PASS, 1 preexisting FAIL: Windows `EPERM` creating a symlink in the repository persistence test (`tests/level-editor.test.ts:376`).
- Baseline browser suite: all 8 tests PASS. Baseline desktop/mobile images use the same single-inventory fixture as the after images.

## Separately approved drag cancellation

The initial layout exposed an existing active-gesture defect. Reproduction: enable the pointer-only field, drag it 0.5 world units to the right, hold the pointer down, resize 959→960 (also 960→959), then move the physical pointer 1px. The field jumped vertically because the gesture used the old starting projection with the resized view. See `active-drag-959-committed.png` versus `active-drag-959-after-resize-move.png` (before the interaction fix).

On 2026-10-20 the user explicitly approved: **“Yes, add safe drag cancellation.”** `CourseCanvas` now cancels and releases pointer capture when its backing size changes, and also checks size at pointer-move time in case the event arrives before the next render. It preserves all previously committed draft movement. New pointer-down waits for a fresh rendered view. Lost pointer capture also clears the gesture. View/world calculations, geometry and simulation are unchanged. Both directions are tested with a held pointer and an actual subsequent screen movement, followed by a correctly aligned fresh drag. This is safe cancellation, not uninterrupted dragging.

## Known limitations and review

Keyboard-only field placement is not implemented by the existing renderer: enable a card, navigate with Tab, and there is no supported keyboard command for moving its canvas field. Ordinary controls and dialogs remain keyboard operable; this change does not claim whole-game WCAG conformance.

Identifiable human Figma/design approval and an uncoached first-time-player check remain pending. Automated checks and agent screenshot review cannot replace them. No remote write or deployment is part of this task.
