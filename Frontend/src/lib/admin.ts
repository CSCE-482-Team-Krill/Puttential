import { centralDate, centralWindowUtc, todayPuzzle } from "./fixtures";
import { isLegalPlacement, pointInPolygon } from "./geometry";
import type { AdminDraft, CourseObject, ForceTile, Point, PuzzleDefinition, TerrainKind } from "./types";

export function newAdminDraft(): AdminDraft {
  const id = `draft-${Date.now().toString(36)}`;
  const puzzle = structuredClone(todayPuzzle());
  puzzle.puzzle_id = id;
  puzzle.version_id = `${id}-v1`;
  puzzle.title = "Untitled course";
  puzzle.subtitle = "A new idea is taking shape.";
  puzzle.active_date = centralDate(1);
  Object.assign(puzzle, centralWindowUtc(puzzle.active_date));
  return { id, title: puzzle.title, puzzle, status: "draft", scheduled_for: centralDate(1), difficulty_notes: "", author_placements: [], revisions: [], updated_at: new Date().toISOString() };
}
export function validateDraft(draft: AdminDraft): string[] {
  const { puzzle } = draft;
  const errors: string[] = [];
  if (!puzzle.title.trim()) errors.push("Give the course a title.");
  if (puzzle.world.placement_boundary.length < 3) errors.push("Define a placement boundary with at least three points.");
  if (!pointInPolygon(puzzle.ball, puzzle.world.placement_boundary)) errors.push("The ball must start inside the placement boundary.");
  if (!pointInPolygon(puzzle.goal, puzzle.world.placement_boundary)) errors.push("The hole must be inside the placement boundary.");
  if (new Set(puzzle.force_tiles.map((tile) => tile.tile_id)).size !== puzzle.force_tiles.length) errors.push("Force tile IDs must be unique.");
  if (new Set(puzzle.objects.map((object) => object.id)).size !== puzzle.objects.length) errors.push("Object IDs must be unique.");
  if (puzzle.force_tiles.some((tile) => tile.shape.length < 3 || tile.magnitude_mn <= 0)) errors.push("Every force tile needs a shape and positive magnitude.");
  if (draft.author_placements.some((placement) => !isLegalPlacement(puzzle, placement))) errors.push("The recorded author layout contains an out-of-bounds tile.");
  return errors;
}
export function addCourseObject(puzzle: PuzzleDefinition, kind: CourseObject["kind"]): PuzzleDefinition {
  const item: CourseObject = { id: `${kind}-${Date.now().toString(36)}`, kind, x: 500, y: 300, width: kind === "wall" ? 22 : 70, height: kind === "wall" ? 170 : 70 };
  return { ...puzzle, objects: [...puzzle.objects, item] };
}
export function addTerrain(puzzle: PuzzleDefinition, kind: TerrainKind): PuzzleDefinition {
  return { ...puzzle, terrain: [...puzzle.terrain, { id: `${kind}-${Date.now().toString(36)}`, kind, polygon: [{ x: 420, y: 225 }, { x: 580, y: 225 }, { x: 580, y: 375 }, { x: 420, y: 375 }] }] };
}
export function addForceTile(puzzle: PuzzleDefinition): PuzzleDefinition {
  const tile: ForceTile = { tile_id: `tile-${Date.now().toString(36)}`, name: "New force tile", shape: [{ x: -40, y: -30 }, { x: 40, y: -30 }, { x: 40, y: 30 }, { x: -40, y: 30 }], direction: { x: 1, y: 0 }, magnitude_mn: 1000, color: "#a6eec6" };
  return { ...puzzle, force_tiles: [...puzzle.force_tiles, tile] };
}
export function updatePoint<T extends Point>(item: T, key: "x" | "y", value: number): T { return { ...item, [key]: value }; }
