import { makePlacement } from "./geometry";
import type { LeaderboardEntry, Point, PuzzleDefinition } from "./types";

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];
export const centralDate = (offsetDays = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays, 12)).toISOString().slice(0, 10);
};
function chicagoMidnightUtc(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  let instant = midnightAsUtc;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const wallAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    instant += midnightAsUtc - wallAsUtc;
  }
  return new Date(instant).toISOString();
}
export function centralWindowUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const following = new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
  return { active_start_utc: chicagoMidnightUtc(date), active_end_utc: chicagoMidnightUtc(following) };
}
export const prettyDate = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function puzzle(id: string, date: string, title: string, subtitle: string, difficulty: PuzzleDefinition["difficulty"], variation: number): PuzzleDefinition {
  const ball = { x: 140, y: variation === 2 ? 405 : 430, radius: 16 };
  const goal = { x: 855, y: variation === 1 ? 235 : 145, radius: 24 };
  const window = centralWindowUtc(date);
  return {
    puzzle_id: id,
    version_id: `${id}-v1`,
    physics_engine_version: "demo-no-physics",
    title, subtitle, active_date: date,
    ...window,
    difficulty,
    world: { width: 1000, height: 600, placement_boundary: rect(38, 38, 924, 524) },
    ball, goal,
    terrain: [
      { id: "grass", kind: "grass", polygon: rect(26, 26, 948, 548) },
      { id: "sand-1", kind: "sand", polygon: [{ x: 382, y: 392 }, { x: 426, y: 357 }, { x: 501, y: 348 }, { x: 560, y: 371 }, { x: 582, y: 418 }, { x: 558, y: 463 }, { x: 501, y: 485 }, { x: 430, y: 475 }, { x: 388, y: 445 }] },
      { id: "ice-1", kind: "ice", polygon: [{ x: 730, y: 154 }, { x: 774, y: 116 }, { x: 858, y: 99 }, { x: 930, y: 119 }, { x: 944, y: 162 }, { x: 911, y: 203 }, { x: 829, y: 219 }, { x: 756, y: 199 }] },
      { id: "mud-1", kind: "mud", polygon: [{ x: 55, y: 82 }, { x: 185, y: 42 }, { x: 360, y: 55 }, { x: 450, y: 119 }, { x: 390, y: 190 }, { x: 210, y: 206 }, { x: 72, y: 172 }] },
    ],
    objects: [
      { id: "wall-a", kind: "wall", x: 463, y: 247, width: 32, height: 128, rotation: 0.35 },
      { id: "bumper-a", kind: "bumper", x: 720, y: 395, width: 54, height: 54 },
      { id: "fan-a", kind: "fan", x: 607, y: 342, width: 78, height: 54 },
    ],
    force_tiles: [
      { tile_id: "a", name: "Breeze", shape: [{ x: -45, y: -28 }, { x: 44, y: -28 }, { x: 60, y: 0 }, { x: 40, y: 31 }, { x: -45, y: 31 }], direction: { x: 1, y: 0 }, magnitude_mn: 1000, color: "#6be6bf" },
      { tile_id: "b", name: "Lift", shape: [{ x: -38, y: 30 }, { x: 0, y: -42 }, { x: 45, y: 30 }], direction: { x: 0.55, y: -0.84 }, magnitude_mn: 1000, color: "#ffd56d" },
      { tile_id: "c", name: "Current", shape: [{ x: -45, y: -26 }, { x: 15, y: -38 }, { x: 53, y: -4 }, { x: 28, y: 34 }, { x: -43, y: 29 }], direction: { x: 0, y: 1 }, magnitude_mn: 2000, color: "#96bdfd" },
      { tile_id: "d", name: "Gust", shape: [{ x: -44, y: -34 }, { x: 46, y: -30 }, { x: 31, y: 34 }, { x: -45, y: 23 }], direction: { x: -1, y: 0 }, magnitude_mn: 4000, color: "#ffa8a0" },
    ],
    sample_placements: [makePlacement("a", { x: 315, y: 305 }), makePlacement("b", { x: 650, y: 365 })],
  };
}

export const todayPuzzle = () => puzzle(`daily-${centralDate()}`, centralDate(), "The Long Way Home", "A little push can change everything.", "Medium", 0);
export const archivePuzzles = () => [
  puzzle("archive-bend", centralDate(-1), "Around the Bend", "Make the bank shot count.", "Easy", 1),
  puzzle("archive-drift", centralDate(-2), "Soft Landing", "Ice rewards a careful touch.", "Hard", 2),
  puzzle("archive-corner", centralDate(-3), "Corner Pocket", "The shortest route is rarely straight.", "Medium", 0),
];
export const allPuzzles = () => [todayPuzzle(), ...archivePuzzles()];
export const getPuzzle = (id: string) => allPuzzles().find((item) => item.puzzle_id === id);

export const sampleLeaderboard: LeaderboardEntry[] = [
  { user_id: "alex", name: "Alex", force_cost_mn: 3000, tile_count: 2, finish_step: 744 },
  { user_id: "sam", name: "Sam", force_cost_mn: 3000, tile_count: 2, finish_step: 834 },
  { user_id: "hao", name: "Hao", force_cost_mn: 3000, tile_count: 3, finish_step: 456 },
  { user_id: "licheng", name: "Licheng", force_cost_mn: 4000, tile_count: 2, finish_step: 348 },
  { user_id: "alan", name: "Alan", force_cost_mn: 6000, tile_count: 3, finish_step: 252 },
  { user_id: "morgan", name: "Morgan", force_cost_mn: 6000, tile_count: 3, finish_step: 252 },
  { user_id: "jules", name: "Jules", force_cost_mn: 8000, tile_count: 3, finish_step: 581 },
];

export const isSampleLayout = (puzzle: PuzzleDefinition, placements: import("./types").Placement[]) =>
  placements.length === puzzle.sample_placements.length && puzzle.sample_placements.every((sample) =>
    placements.some((placement) => placement.tile_id === sample.tile_id && Math.abs(placement.x_q - sample.x_q) <= 1024 && Math.abs(placement.y_q - sample.y_q) <= 1024));
