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
  const ball = { x: 122, y: variation === 2 ? 410 : 330, radius: 16 };
  const goal = { x: 855, y: variation === 1 ? 160 : 300, radius: 24 };
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
      { id: "sand-1", kind: "sand", polygon: [{ x: 350, y: 48 }, { x: 490, y: 48 }, { x: 460, y: 240 }, { x: 330, y: 220 }] },
      { id: "ice-1", kind: "ice", polygon: [{ x: 615, y: 365 }, { x: 812, y: 355 }, { x: 840, y: 540 }, { x: 640, y: 540 }] },
      { id: "mud-1", kind: "mud", polygon: rect(520, 74, 150, 110) },
    ],
    objects: [
      { id: "wall-a", kind: "wall", x: 305, y: 295, width: 25, height: 240 },
      { id: "wall-b", kind: "wall", x: 605, y: 285, width: 22, height: 255 },
      { id: "bumper-a", kind: "bumper", x: 745, y: 235, width: 54, height: 54 },
      { id: "fan-a", kind: "fan", x: 470, y: 460, width: 80, height: 56 },
    ],
    force_tiles: [
      { tile_id: "a", name: "Breeze", shape: [{ x: -45, y: -28 }, { x: 44, y: -28 }, { x: 60, y: 0 }, { x: 40, y: 31 }, { x: -45, y: 31 }], direction: { x: 1, y: 0 }, magnitude_mn: 1000, color: "#6be6bf" },
      { tile_id: "b", name: "Lift", shape: [{ x: -38, y: 30 }, { x: 0, y: -42 }, { x: 45, y: 30 }], direction: { x: 0.55, y: -0.84 }, magnitude_mn: 1000, color: "#ffd56d" },
      { tile_id: "c", name: "Current", shape: [{ x: -45, y: -26 }, { x: 15, y: -38 }, { x: 53, y: -4 }, { x: 28, y: 34 }, { x: -43, y: 29 }], direction: { x: 0, y: 1 }, magnitude_mn: 2000, color: "#96bdfd" },
      { tile_id: "d", name: "Gust", shape: [{ x: -44, y: -34 }, { x: 46, y: -30 }, { x: 31, y: 34 }, { x: -45, y: 23 }], direction: { x: -1, y: 0 }, magnitude_mn: 4000, color: "#ffa8a0" },
    ],
    sample_placements: [makePlacement("a", { x: 205, y: 345 }), makePlacement("b", { x: 510, y: 335 })],
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
