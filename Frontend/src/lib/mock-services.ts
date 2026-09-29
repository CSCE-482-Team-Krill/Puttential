import { allPuzzles, archivePuzzles, getPuzzle, isSampleLayout, sampleLeaderboard, todayPuzzle } from "./fixtures";
import { forceCost } from "./geometry";
import { rankedLeaderboard } from "./leaderboard";
import type { AuthPort, GameDataPort, SimulationPort } from "./ports";
import type { DemoResult, DemoUser, Placement, Point, PuzzleDefinition, RunSnapshot } from "./types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockAuth: AuthPort = {
  async signIn(method, name) { await delay(250); return { id: "demo-me", name: name.trim() || "Demo player", method, demo: true }; },
  async signOut() { await delay(100); },
};

export const mockGameData: GameDataPort = {
  async getToday() { return todayPuzzle(); },
  async getPuzzle(id) { return getPuzzle(id); },
  async getArchive() { return archivePuzzles(); },
  async getLeaderboard(_puzzleId, user, ownResult) {
    const own = user && ownResult ? [{ user_id: user.id, name: user.name, force_cost_mn: ownResult.force_cost_mn, tile_count: ownResult.tile_count, finish_step: ownResult.finish_step, is_me: true }] : [];
    return rankedLeaderboard([...sampleLeaderboard, ...own]);
  },
  async validate(puzzle, placements, reject = false) {
    await delay(1000);
    if (reject) return { status: "rejected", reason: "Demo validation rejected this run. Your planning layout is ready to edit." };
    if (!isSampleLayout(puzzle, placements)) return { status: "rejected", reason: "This scripted demo only accepts the sample layout." };
    const result: DemoResult = {
      puzzle_id: puzzle.puzzle_id, version_id: puzzle.version_id, placements: [...placements],
      force_cost_mn: forceCost(puzzle, placements), tile_count: placements.length,
      finish_step: 780, solved_at: new Date().toISOString(),
      daily_eligible: puzzle.puzzle_id.startsWith("daily-"), demo: true,
    };
    return { status: "accepted", result };
  },
  async getPlayback(puzzle, viewerSolved, userId) {
    if (!viewerSolved) throw new Error("Solve this puzzle before viewing another layout.");
    if (userId === "demo-me") return puzzle.sample_placements;
    return allPuzzles().find((item) => item.puzzle_id === puzzle.puzzle_id)?.sample_placements ?? [];
  },
};

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function scriptedPoint(puzzle: PuzzleDefinition, step: number): Point {
  const t = Math.min(1, step / 780);
  if (t >= 1) return puzzle.goal;
  const points: Point[] = [puzzle.ball, { x: 265, y: 340 }, { x: 345, y: 455 }, { x: 485, y: 492 }, { x: 630, y: 465 }, { x: 720, y: 370 }, puzzle.goal];
  const scaled = t * (points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const smooth = local * local * (3 - 2 * local);
  return lerp(points[index], points[index + 1], smooth);
}
function experimentalPoint(puzzle: PuzzleDefinition, step: number): Point {
  const t = step / 120;
  return { x: puzzle.ball.x + Math.min(280, t * 28) + Math.sin(t * 1.8) * 18, y: puzzle.ball.y + Math.sin(t * 1.25) * 58 };
}
export class DemoSimulation implements SimulationPort {
  private frame = 0;
  private step = 0;
  private last = 0;
  private paused = false;
  private rate: 0.5 | 1 | 2 = 1;
  private stopped = false;
  private readonly sample: boolean;
  constructor(private puzzle: PuzzleDefinition, placements: Placement[]) { this.sample = isSampleLayout(puzzle, placements); }
  start(onSnapshot: (snapshot: RunSnapshot) => void, onSuccess: () => void) {
    this.stopped = false;
    this.last = performance.now();
    const tick = (now: number) => {
      if (this.stopped) return;
      const delta = now - this.last;
      this.last = now;
      if (!this.paused) {
        this.step += delta * 0.24 * this.rate;
        const point = this.sample ? scriptedPoint(this.puzzle, this.step) : experimentalPoint(this.puzzle, this.step);
        const trail = Array.from({ length: 12 }, (_, i) => this.sample ? scriptedPoint(this.puzzle, Math.max(0, this.step - (11 - i) * 14)) : experimentalPoint(this.puzzle, Math.max(0, this.step - (11 - i) * 14)));
        onSnapshot({ step: Math.floor(this.step), ball: point, trail });
        if (this.sample && this.step >= 780) { this.abort(); onSuccess(); return; }
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.last = performance.now(); }
  setRate(rate: 0.5 | 1 | 2) { this.rate = rate; }
  abort() { this.stopped = true; cancelAnimationFrame(this.frame); }
}
