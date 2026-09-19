import type { LeaderboardEntry } from "./types";

export function rankedLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => a.force_cost_mn - b.force_cost_mn || a.tile_count - b.tile_count || a.finish_step - b.finish_step);
  return sorted.map((entry, index) => ({ ...entry, rank: 1 + sorted.findIndex((candidate) => candidate.force_cost_mn === entry.force_cost_mn && candidate.tile_count === entry.tile_count && candidate.finish_step === entry.finish_step) }));
}
export function percentile(entries: LeaderboardEntry[], me: LeaderboardEntry): number {
  const worse = entries.filter((entry) => entry.force_cost_mn > me.force_cost_mn || (entry.force_cost_mn === me.force_cost_mn && (entry.tile_count > me.tile_count || (entry.tile_count === me.tile_count && entry.finish_step > me.finish_step)))).length;
  return Math.round((100 * worse) / entries.length);
}
