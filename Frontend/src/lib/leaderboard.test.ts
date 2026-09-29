import { describe, expect, it } from "vitest";
import { percentile, rankedLeaderboard } from "./leaderboard";

describe("sample leaderboard representation", () => {
  it("orders force, then tiles, then finish step and shares exact ties", () => {
    const entries = rankedLeaderboard([
      { user_id: "slow", name: "Slow", force_cost_mn: 3000, tile_count: 2, finish_step: 900 },
      { user_id: "fast", name: "Fast", force_cost_mn: 3000, tile_count: 2, finish_step: 600 },
      { user_id: "tie", name: "Tie", force_cost_mn: 3000, tile_count: 2, finish_step: 600 },
      { user_id: "few", name: "Few", force_cost_mn: 3000, tile_count: 1, finish_step: 2000 },
      { user_id: "more", name: "More", force_cost_mn: 4000, tile_count: 1, finish_step: 100 },
    ]);
    expect(entries.map((entry) => entry.user_id)).toEqual(["few", "fast", "tie", "slow", "more"]);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 2, 4, 5]);
    expect(percentile(entries, entries[1])).toBe(40);
  });
});
