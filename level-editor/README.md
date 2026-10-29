# Puttential level editor

The desktop editor uses the main game's renderer, force controls, prediction and Rapier simulation. It saves directly into `src/game/levels/authored/`.

## Run locally

Use Node 22.12 or newer. From the repository root:

```sh
npm install
npm run editor
```

Open **http://127.0.0.1:3001**. No database, account or environment configuration is needed. `npm run game` starts Design C at http://127.0.0.1:3000. For a production build running locally, use `npm run editor:build` then `npm run editor:start`.

## Level locations

Paths below are relative to the repository root:

| File                                            | Purpose                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/game/levels/authored/<id>.json`            | Editor-saved game data, loaded with the engine's `parseLevel`.                      |
| `src/game/levels/authored/<id>.editor.json`     | Companion editor name, board bounds, managed wall IDs/thickness and game-file hash. |
| `src/game/levels/legacy/bar-around-corner.json` | Legacy Bar Around Corner course from an earlier game version.                       |
| `src/game/levels/legacy/radial-relay.json`      | Legacy Radial Relay course, including its circular ball.                            |

The **Repository library** lists authored levels. **Legacy courses** loads courses from an earlier game version with their managed wall mappings. Saving a legacy course creates an authored copy; it does not overwrite the bundled legacy file.

## Author a course

- Start a new course, open a legacy course, import JSON, or open a saved repository level.
- Drag a preset from the palette, or select it and click on the course. Use the object list to select overlapping objects, the goal, or disabled fields.
- Ctrl/Cmd-click objects on the canvas or in the object list to toggle multiple selections. Right-drag a rectangle to select fully enclosed objects; Ctrl/Cmd-right-drag adds a region. Managed walls are excluded. Drag a selected object to move the whole group.
- Drag objects to move them. Coral handles resize and rotate; green edge handles resize the board. Numeric controls support precise transforms. Board width/height changes are centered; dragging an edge keeps the opposite edge fixed.
- Use the wheel or +/− controls to zoom, Alt-drag or middle-drag to pan, and **Fit board** to reset. Optional snapping uses a quarter world unit and 15 degrees.
- Circles use native Rapier ball colliders and exact radius controls; resizing preserves their circular shape. **Shape type** can explicitly convert a piece. Rectangles keep their type until vertex editing converts them to polygons. Fields support rectangles and polygons only.
- Changing **Shape type** to Circle starts with radius `0.4`; Rectangle starts at `1 × 1`. Set the desired dimensions afterward. Converting to Polygon uses the current outline, including a polygon approximation when converting a circle.
- Enable **Show vertex handles** to drag vertices. The inspector also edits coordinates, inserts/deletes vertices, and adds/removes convex pieces. **Replace with a custom outline** accepts one local `x,y` pair per line and uses the game's triangulator to turn a concave solid into convex pieces. This replaces existing pieces and their density overrides.
- Body pieces must be convex and counter-clockwise. Fields may be concave, with either winding. Neither supports holes or self-intersection, matching the engine. Force sources/centers must stay inside their field polygon.
- **Board → Level borders** adds or removes the managed outer walls. Borders are optional; turning them off preserves the playable area and all other objects, with one undo step. Board width/height remain editable without walls.
- Initial geometry, including complete circles, disabled fields and the goal, must fit within the board. Invalid placements, rotations, geometry edits and board shrinks are rejected. During play, overhang is allowed: a body fails the level only once all of its pieces are completely outside the playable area. Touching the boundary remains valid.
- The failure rule applies to every moving body, including bodies other than the goal target. The shared engine checks actual circle and polygon geometry, rather than just an object’s center or bounding box. Reset restores the initial positions and clears the failure.
- Managed boundary walls are edited with Board controls. Imported documents may declare no managed walls; resizing changes the playable area without creating physical walls. The toggle never deletes arbitrary imported obstacles. Open through Repository library to retain managed-wall metadata.
- **Playtest** creates the main game's Rapier world. It uses the same timestep, forces, collisions, prediction, shared frontend goal tracking and player controls as Design C. Stop/reset and return to editing are available even for a course that never settles. Test placements do not change the authored course.

Playable bounds are saved in the game JSON independently of wall geometry, so an open course keeps its dimensions when loaded in the game or imported without the editor sidecar. Older files without explicit bounds use their initial geometry as the playable area; older sidecar-only board sizes are retained when reopened in the editor.

Goal completion checks the target body's position against the goal bounds for the configured hold time, after every engine tick. It does not require the entire body to fit inside the goal. Authoring bounds still apply to the whole shape.

Circle collisions, mass and inertia use the engine's true disc geometry. The engine integrates field loads over an equal-area 32-sided outline; both apps use this same force calculation. This approximation does not change the circular collider or the saved circle shape.

Shortcuts outside text inputs: Ctrl/Cmd+C copies the selected bodies or fields, Ctrl/Cmd+V pastes, Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y redoes, Ctrl/Cmd+D duplicates, Delete removes, and Escape cancels a canvas gesture or placement. A complete drag or paste is one undo entry. History retains the last 100 edits.

Group copy/paste preserves relative positions, assigns fresh object/piece IDs, and gives copied portal ends a new shared pair ID. Copy both ends to keep a working pair; a copied single end stays inactive until linked. Group movement, paste, duplicate and deletion each use one undo entry and reject the entire edit when any member is invalid.

Object copy/paste uses an editor clipboard for the current tab, including between courses opened in that tab. It captures the object when copied and gives each paste new object/piece IDs. The pasted object is selected at its copied position; drag it to separate overlapping copies. Geometry, forces and body properties are preserved, and paste is rejected if the object would extend outside the destination board. Copying the goal target does not change which body the goal tracks. Goals and managed boundary walls cannot be copied. Text fields retain their normal system clipboard behavior; the object clipboard clears on page reload.

## Water, lava and portals

Use **Fields & hazards** in the palette. These objects start enabled and stay fixed during play; they are excluded from the player’s force tile inventory and score.

- **Water** applies heavy drag in proportion to overlap once the body’s center of mass enters the zone. A fully submerged body sinks once its linear and angular speeds fall below the configured threshold (default `0.06`). Drag defaults to `12`; rim-only contact has no effect; partial immersion with the center inside slows the ball without sinking it. The shared canvas uses the supplied blue texture as a repeating surface, with a slight dip and a translucent surface layer over the body.
- **Lava** zeros linear and angular velocity and chars the body black when its center of mass enters the zone. Rim-only contact is safe. The remains stay visible and stationary beneath the repeating orange texture, and remain a solid collider. The swept center path also detects fast crossings of thin lava zones. The shot still fails.
- **Portal pair** places two oval ends, two units apart, in one undo step. Both must fit on the board. Each end shares its partner’s **Portal pair ID**; a pair can have at most two ends. A lone or disabled partner is inactive. A captured body waits at the entry for **Teleport delay (seconds)** (default `0.25`) before emerging. Its incoming linear and angular velocity are preserved; **Rotate velocity with exit** rotates velocity and body angle by the difference between endpoint orientations. This option applies to the selected entry end. After emerging, **Teleport cooldown (seconds)** (default `0.75`) blocks all portals. The body must also leave the pair before it can re-enter it. Timing settings apply to the selected entry end. Each pair has its own color in both apps; selection adds a dashed marker and keeps the ring color.

Hazard failure prevents goal completion and is reported in playtest and the game. Reset restores the ball and portal state. Decorative animation respects Reduced motion.

## Save and play files

**Save to repository** writes two files using the level ID:

```text
src/game/levels/authored/my-course.json
src/game/levels/authored/my-course.editor.json
```

The first file is canonical engine JSON: `formatVersion: 1`, a positive integer level `version`, shapes, direct force properties and flat goal bounds. It goes straight into `parseLevel`; no generated TypeScript loader or force hydration is needed. **Open local course** in Design C accepts this file and derives its title from the level ID. The sidecar uses its own schema `version: 2` and stores the editor display name, board bounds and managed wall IDs. Commit both files to retain authoring settings. Saving does not publish or commit a course.

IDs use 1–80 lowercase letters, digits and hyphens, starting with a letter or digit. The game filename must match the JSON's `id`. Change the ID to Save As. Reopen a repository level before overwriting it. Revision checks cover both files; external changes require reopening or choosing a different ID. Saving changed engine data, including prediction settings, raises the level version to at least the previous version plus one. Metadata-only edits do not automatically raise it. An explicitly higher version is retained; an existing level's version is never lowered by saving. The inspector exposes both level version and optional prediction settings.

Each file is replaced atomically, with game JSON written last. Metadata is tied to the exact JSON hash. If a save is interrupted between replacements or another contributor edits JSON directly, loading ignores stale metadata and warns that bounds were recalculated. Bare JSON imports also derive editing bounds from geometry and leave walls unmanaged. Open through the repository library to recover matching metadata. A killed save process may leave an `<id>.lock`; remove it only after confirming no save process is active.

To reopen a saved course with its name and managed boundaries, use **Repository library → Open**. File import accepts the game `.json` but does not read its adjacent sidecar; `.editor.json` is not a standalone course. Even a whitespace-only edit to game JSON changes its hash and invalidates the sidecar association. Invalid JSON or invalid matching metadata produces a load error.

Older `.puttential.json` documents migrate supported data on load. Saving writes the new pair and preserves the original legacy file (and any old loader). The current engine supports uniform, attractor and repulsor forces plus water, lava and portal zones; legacy vortex/drag documents produce an explicit error. Old polygon balls stay polygons until deliberately converted with **Shape type**.

When both `<id>.json` and `<id>.puttential.json` exist, the library opens the new game JSON. Legacy loaders continue to reference their original files; update application imports to the new game JSON when migrating a course.

Recovery drafts use browser local storage. On reload, choose whether to restore. Recovered/imported drafts have no disk revision: reopen the repository copy to overwrite it, or change the ID to keep both. Recovery is separate from repository saving. Import/save failures preserve current edits. If a browser draft cannot be read or migrated, the editor preserves it and pauses new recovery writes until you choose **Discard incompatible draft**. Repository saves remain available.

The local API restricts writes to the authored folder and loopback, same-origin requests. It is a local authoring service, not a production publishing endpoint. Arbitrary TypeScript uploads are not executed; register trusted JSON starters or import JSON.

## Shared source and extension recipe

| Source                                                | Responsibility                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/game/simulation.ts`, `objects/`, `geometry/`     | Every simulation and prediction. Rapier stays pinned to 0.20.0; no alternate editor physics. |
| `src/frontend/course-canvas.tsx`                      | Game, editor and playtest drawing.                                                           |
| `src/frontend/puzzle.ts`, `player-controls.tsx`       | Shared loop, field controls and Play/Stop.                                                   |
| `src/frontend/goal-progress.ts`                       | Goal hold tracking from each engine tick.                                                    |
| `src/frontend/game.css`, `icon.tsx`, `field-label.ts` | Design C styles, icons and labels.                                                           |
| `src/game/levels/codec.ts`, `document.ts`             | Editor metadata/migration and full-shape bounds; `levels/parse.ts` owns engine validation.   |
| `src/game/levels/starters.ts`                         | Game archive and editor starters.                                                            |

Design C's old canvas/hook paths are compatibility re-exports. Update shared source instead of copying it. Authoring gestures and inspector controls stay under `level-editor/`; framework-independent geometry/data stay under `src/game/`. Both apps share the root npm dependency lock and the same React/Next versions.

1. Extend the main game's `FieldForceDefinition`, `levels/parse.ts`, and `objects/forces.ts` for a new force.
2. Add its label, defaults, parameter schema and `create()` data factory to `objects/catalog.ts`; keep the factory values consistent with the declared defaults. The exhaustive metadata record checks coverage of the engine force union; palette and inspector consume it automatically. Visual arrows sample the engine force law.
3. Add presets using existing shape kinds in `objects/presets.ts`. They appear for static/dynamic bodies, including compound pieces.
4. Register JSON starters in `levels/starters.ts` with explicit managed boundary IDs.
5. Check parser/engine compatibility, both app builds and browser interactions.

An entirely new shape or mechanic also needs engine validation, physics, drawing, exact bounds and authoring controls. Unknown properties are rejected; schema changes need explicit migration. See [the synchronization plan](PLAN.md).

The current starters are Bar Around Corner and Radial Relay. Radial Relay has a true circular ball. Upstream restitution is now 0.8, and the contributor notes that starter force placements need retuning; the supplied placements are not verified solutions.

## Verification

```sh
npm test
npm run editor:build
npm run game:build
npx prisma generate --schema prisma/schema.prisma # if the backend client is absent
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Prisma generation supplies backend types for the full repository check; it is not needed to run the editor. Unit tests cover starter round trips, identical Rapier replays, native circle geometry, fields, compound geometry, bounds, history, repository conflicts, legacy migration and goal tracking. Browser tests exercise authoring, save/reopen, playtest, game import, starter selection and incompatible recovery. They start or reuse the apps on ports 3001 and 3000, remove their temporary `browser-check-*` levels afterward and save screenshots under `level-editor/screenshots/`. For an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable instead of installing a Playwright browser.

Validation and goal completion do not prove multiple practical solutions. Test intended solutions before adding a course to the daily rotation.
