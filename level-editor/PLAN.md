# Level editor implementation and synchronization plan

## Confirmed scope

Desktop first, in `level-editor/`, using the game's existing frontend and Rapier engine. Save directly to the repository. Support drag/drop, board expansion, presets and full supported geometry editing. Reject any placement, rotation, resize, import or save whose complete geometry extends outside the board. No open implementation questions remain from the initial planning discussion.

## Upstream changes checked

The JSON migration used `origin/main` at `3e06ee3` and `origin/game-engine` at `6ee7f5e`. The engine implementations at those revisions match; the game-engine branch also removes obsolete TypeScript starter modules. Commit `a53f4a6` introduces JSON levels and parsing. These hashes record the integration baseline, not an ongoing assertion about remote branch tips.

| Contract                                                      | Editor integration                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `levels/types.ts` and `levels/parse.ts`                       | Use upstream `parseLevel` for every import, save and playtest. No parallel engine schema.                                                                         |
| JSON `formatVersion: 1`, per-level positive integer `version` | Preserve both. Repository saves increment `version` when gameplay data changes; metadata changes alone do not.                                                    |
| Body `shape`: rectangle, polygon or circle                    | Preserve the actual shape type, dimensions/radius, compound pieces and density overrides.                                                                         |
| Field shape: rectangle or polygon                             | Preserve concavity and transforms. Circular fields are not supported by the current engine.                                                                       |
| Forces: uniform, attractor, repulsor                          | Save direct engine properties (e.g. `{kind:'uniform', density:{x:1,y:0}}`). Engine selects the force law.                                                         |
| Flat goal bounds and optional prediction settings             | Expose all properties and honor prediction defaults in the shared frontend.                                                                                       |
| Circle render records and native Rapier ball colliders        | Shared canvas draws arcs; bounds/hit tests use analytical circles. Collisions use circles; the engine integrates field loads over an equal-area 32-sided outline. |
| Engine render state has no goal-progress record               | Shared frontend evaluates the goal after every engine tick for both apps, without changing engine physics.                                                        |
| Snapshot ID/version checks                                    | Preserve versions so snapshots from another course revision are rejected.                                                                                         |

The canonical starters are now `bar-around-corner.json` and `radial-relay.json`. The latter contains the actual circular ball. Upstream increased restitution to 0.8 and notes that starter force placements need retuning; importing these files does not establish solvability.

## Modules and ownership

- `src/game/`: upstream parser, simulation, forces, body construction and geometry. Editor helpers add document metadata, exact authoring bounds and preset/catalog data. Never add a separate editor physics loop.
- `src/frontend/`: shared course canvas, icons, styles, field labels, player controls, goal tracking and React simulation hook. Design C and editor playtest use these same modules.
- `level-editor/editor/`: document changes, history and repository persistence.
- `level-editor/components/`: authoring input, selection handles, property inspector and playtest wrapper.
- `level-editor/app/`: desktop shell and local API.

Use root npm workspaces for Design C and the editor. Keep one dependency lock and the same React/Next versions. A/B prototypes remain independent.

## Repository storage

Save two files under `src/game/levels/authored/`:

1. `<id>.json`: only canonical engine `Level` JSON, directly accepted by `parseLevel`. No editor wrapper, display name or executable functions.
2. `<id>.editor.json`: editor schema version 2, display name, board bounds, managed wall IDs/thickness, and a hash tying metadata to the exact game JSON.

No generated TypeScript loader is required. The main game can import JSON and call `parseLevel`, or open the saved JSON through **Open local course**. The game derives a title from the level ID; the editor display name stays in metadata.

Use revision conflict checks across both files, a per-level save lock and atomic replacement of each file. Write metadata first and game JSON last. Because two files cannot be replaced atomically together, loading mismatched metadata falls back to bounds derived from the actual level and displays a warning. Preserve the game file as the authoritative source. Never silently overwrite external changes.

Support previous `.puttential.json` editor documents with explicit migration: local polygons become polygon shapes, force parameters move onto the engine force object, goal bounds flatten, and the old name moves to metadata. Keep original legacy files untouched when saving new files. Unsupported old mechanics such as vortex or drag are rejected with an actionable error. Legacy polygons stay polygons; conversion to circles must be intentional. Browser recovery uses the same migration.

The repository library prefers canonical JSON when both formats exist and reads matching metadata. File import reads only the selected game file, not its adjacent metadata; a sidecar is not a standalone level. Incompatible browser drafts are retained and new recovery writes pause until the user explicitly discards them.

## Geometry and board behavior

- Presets include actual circles, rectangles, triangles, hexagons and compound bodies.
- Move, rotate, resize, duplicate, delete and inspect objects. Circle scaling remains uniform, including compound bodies containing circles; radius controls are available.
- Vertex editing explicitly converts a rectangle to a polygon. Circles have no vertices unless explicitly converted. Convex body pieces and concave field outlines use engine validation.
- Custom concave body outlines use the shared triangulator and replace existing pieces/density overrides. Holes and self-intersections remain unsupported by the engine.
- Check exact whole-shape bounds, including disabled fields and goals, for every edit/import/save. Reject shrinking that excludes objects.
- New courses and registered starters have four explicit managed walls. Expansion updates these walls while preserving interior geometry and IDs. Numeric resizing is centered; dragging an edge anchors its opposite edge.
- Plain JSON lacks editor ownership metadata: infer editing bounds from geometry and leave walls unmanaged. Changing these bounds does not reshape existing obstacles. Reopening through the repository library restores matching metadata.
- Camera zoom/pan/fit stays separate from board bounds. One gesture is one undo step; Escape cancels. Keyboard shortcuts do not intercept text input.

## Synchronizing future engine changes

1. Implement new mechanics in the main engine's types, parser, force/body logic and render records.
2. For a force, add metadata in `objects/catalog.ts`: kind, labels, defaults and parameter controls. Its exhaustive `Record<FieldForceDefinition['kind'], ...>` catches missing entries when the engine union changes. Palette, inspector and generic force visualization consume this metadata and the engine force law.
3. For a preset using existing shapes, add only `objects/presets.ts`. Entirely new shape kinds also require explicit parser, physics, rendering, bounds and geometry controls; a catalog cannot create missing physics.
4. Keep shared components at their common source and use both app builds as integration gates.

## Verification and handoff

- Round-trip both current JSON starters through upstream parsing and compare fixed-command Rapier replays in the same runtime.
- Check actual collider shape, circle mass, analytic bounds/hits, shape preservation, malformed inputs, prediction defaults and versioned snapshots.
- Test repository JSON/metadata, content version increments, conflicts, symlinks, legacy migration and mismatched metadata recovery.
- Check shared per-tick goal holds/reset, board resizing, history and compound geometry.
- Browser checks cover the reported starter-dropdown runtime error, circle controls, drag/drop, vertex edits, zoom/pan/cancellation, save/reopen, playtest preservation and main-game import.
- Run unit tests, both app builds, root typecheck, browser tests, screenshot review and Git whitespace/status checks. These verify compatibility; intended solutions still need playtesting before daily publication.

## Local commands

```sh
npm install
npm run editor          # http://127.0.0.1:3001
npm run game            # http://127.0.0.1:3000, separate terminal
npm test
npm run editor:build
npm run game:build
npm run typecheck
npm run test:e2e
```

Use Node 22.12+. Generate the Prisma client if missing for the full repository typecheck; neither app needs a database for local authoring. Install Chromium with `npx playwright install chromium` before browser checks.
