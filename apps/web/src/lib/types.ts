export type Point = { x: number; y: number };
export type Polygon = Point[];

export type TerrainKind = "grass" | "sand" | "ice" | "gravel" | "mud" | "water";
export type TerrainRegion = { id: string; kind: TerrainKind; polygon: Polygon };
export type CourseObject = {
  id: string;
  kind: "wall" | "bumper" | "spring" | "fan" | "magnet";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};
export type ForceTile = {
  tile_id: string;
  name: string;
  shape: Polygon;
  direction: Point;
  magnitude_mn: number;
  color: string;
};
export type PuzzleDefinition = {
  puzzle_id: string;
  version_id: string;
  physics_engine_version: string;
  title: string;
  subtitle: string;
  active_date: string;
  active_start_utc: string;
  active_end_utc: string;
  difficulty: "Easy" | "Medium" | "Hard";
  world: { width: number; height: number; placement_boundary: Polygon };
  ball: Point & { radius: number };
  goal: Point & { radius: number };
  terrain: TerrainRegion[];
  objects: CourseObject[];
  force_tiles: ForceTile[];
  sample_placements: Placement[];
};
export type Placement = { tile_id: string; x_q: number; y_q: number };
export type RunSnapshot = { step: number; ball: Point; trail: Point[] };
export type RunState = "planning" | "running" | "paused" | "validation-pending" | "solved-locked";
export type ValidationResult =
  | { status: "accepted"; result: DemoResult }
  | { status: "rejected"; reason: string };
export type DemoResult = {
  puzzle_id: string;
  version_id: string;
  placements: Placement[];
  force_cost_mn: number;
  tile_count: number;
  finish_step: number;
  solved_at: string;
  daily_eligible: boolean;
  demo: true;
};
export type LeaderboardEntry = {
  user_id: string;
  name: string;
  force_cost_mn: number;
  tile_count: number;
  finish_step: number;
  rank?: number;
  is_me?: boolean;
};
export type DemoUser = { id: string; name: string; method: string; demo: true };
export type Preferences = { grid: boolean; coordinates: boolean; reducedMotion: boolean; labels: boolean };
export type AdminDraft = {
  id: string;
  title: string;
  puzzle: PuzzleDefinition;
  status: "draft" | "locally-published";
  scheduled_for: string;
  difficulty_notes: string;
  author_placements: Placement[];
  revisions: { at: string; summary: string; puzzle: PuzzleDefinition }[];
  updated_at: string;
};
