# Authored courses

The local editor saves `<level-id>.json` (canonical game data) and `<level-id>.editor.json` (editor name, board bounds, managed walls and game-file hash) here. Commit both to preserve the authoring setup.

The game file loads directly with `parseLevel`, just like the bundled JSON starters in the parent `levels/` directory. It uses `formatVersion: 1` and a positive integer content `version`; editor metadata has a separate schema `version: 2`. Design C's **Open local course** accepts the game file and derives its title from the level ID. No generated TypeScript loader is needed.

Use **Repository library → Open** to restore the editor name, bounds and managed walls. Importing the game file alone does not read its companion metadata, and a sidecar cannot be imported as a standalone course. The game filename must match its `id`.

Saving changed engine data, including prediction settings, raises the content version to at least the previous version plus one. Metadata-only edits do not automatically raise it. Saves retain an explicitly higher version and reject stale disk revisions. Open an existing repository level before overwriting it, or change the ID to Save As.

Metadata is associated with the exact game-file hash. Any external change to the game file, including formatting, makes the editor ignore the old metadata and recalculate bounds with no managed walls. Review the warning and bounds when reopening. Saving does not publish a daily course or commit files.

Legacy `.puttential.json` documents can migrate uniform, attractor and repulsor forces; unsupported mechanics produce an error. Saving leaves the old file and any loader untouched. If both old and new files exist, the library prefers `<level-id>.json`.

See [the editor guide](../../../../level-editor/README.md) for local commands, geometry tools and migration details.
