# Authored courses

The local editor saves `<level-id>.json` (canonical game data) and `<level-id>.editor.json` (editor name, board bounds, managed walls and game-file hash) here. Commit both to preserve the authoring setup.

The game file loads directly with `parseLevel`, just like the bundled JSON starters in the parent `levels/` directory. It uses `formatVersion: 1` and a positive integer content `version`; editor metadata has a separate schema `version: 2`. Design C's **Open local course** accepts the game file and derives its title from the level ID. No generated TypeScript loader is needed.

Use **Repository library → Open** to restore the editor name, bounds and managed walls. Importing the game file alone does not read its companion metadata, and a sidecar cannot be imported as a standalone course. The game filename must match its `id`.

Five playtest courses include an enabled launch tile: open one in the editor, choose **Playtest**, then **Play** for a working baseline. Move or rotate the launch tile to experiment; reset the test layout to restore the authored placement. Each course also solves with the launch tile shifted upward by 0.125 world units.

| Course / library ID               | Features                                    | Route to try                                                                                            |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Ember Alley / `ember-alley`       | Lava, outer walls                           | Follow the narrow safe lane between two lava banks. Aim toward a bank to test burning.                  |
| Cinder Ford / `cinder-ford`       | Lava and water, outer walls                 | Cross the shallow water with enough momentum while staying between the lava pools.                      |
| Tidal Transfer / `tidal-transfer` | Water and one portal pair, outer walls      | Cross the pool and enter the portal to pass the reef divider and reach the upper goal.                  |
| Open Water Hop / `open-water-hop` | Water and one portal pair, no outer walls   | Transfer to the lower goal lane. Keep part of the ball inside the dashed board bounds to avoid failure. |
| Prism Relay / `prism-relay`       | Two portal pairs, outer walls and obstacles | Chain the two matching-color pairs to cross the divider and finish in the lower lane.                   |

Portal transfers take 0.25 seconds and have a 0.75-second return cooldown. These are local editing/playtest courses; adding them here does not publish them as daily puzzles.

Saving changed engine data, including prediction settings, raises the content version to at least the previous version plus one. Metadata-only edits do not automatically raise it. Saves retain an explicitly higher version and reject stale disk revisions. Open an existing repository level before overwriting it, or change the ID to Save As.

Metadata is associated with the exact game-file hash. Any external change to the game file, including formatting, makes the editor ignore the old metadata and recalculate bounds with no managed walls. Review the warning and bounds when reopening. Saving does not publish a daily course or commit files.

Legacy `.puttential.json` documents can migrate uniform, attractor and repulsor forces; unsupported mechanics produce an error. Saving leaves the old file and any loader untouched. If both old and new files exist, the library prefers `<level-id>.json`.

See [the editor guide](../../../../level-editor/README.md) for local commands, geometry tools and migration details.
