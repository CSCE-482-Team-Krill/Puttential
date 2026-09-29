import { describe, expect, it } from "vitest";
import { newAdminDraft, validateDraft } from "./admin";
import { makePlacement } from "./geometry";

describe("authoring structure gate", () => {
  it("allows a sound local template and rejects misplaced author tiles", () => {
    const draft = newAdminDraft();
    expect(validateDraft(draft)).toEqual([]);
    draft.author_placements = [makePlacement("a", { x: 5, y: 5 })];
    expect(validateDraft(draft)).toContain("The recorded author layout contains an out-of-bounds tile.");
  });
  it("rejects duplicate stable IDs and missing title", () => {
    const draft = newAdminDraft();
    draft.puzzle.title = "";
    draft.puzzle.force_tiles.push({ ...draft.puzzle.force_tiles[0] });
    expect(validateDraft(draft)).toEqual(expect.arrayContaining(["Give the course a title.", "Force tile IDs must be unique."]));
  });
});
