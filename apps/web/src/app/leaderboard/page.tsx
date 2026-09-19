"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LockKeyhole, Medal, Trophy, Users } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { allPuzzles, prettyDate, todayPuzzle } from "@/lib/fixtures";
import { percentile, rankedLeaderboard } from "@/lib/leaderboard";
import { secondsForStep } from "@/lib/geometry";
import { mockGameData } from "@/lib/mock-services";

export default function LeaderboardPage() {
  const [puzzleId, setPuzzleId] = useState(todayPuzzle().puzzle_id);
  const [tab, setTab] = useState<"top" | "around">("top");
  const puzzle = allPuzzles().find((item) => item.puzzle_id === puzzleId) ?? todayPuzzle();
  const user = useAppStore((state) => state.user);
  const result = useAppStore((state) => state.results[puzzleId]);
  const { data: entries = [] } = useQuery({ queryKey: ["leaderboard", puzzleId, user?.id, result?.solved_at], queryFn: () => mockGameData.getLeaderboard(puzzleId, user, result) });
  const ranked = rankedLeaderboard(entries);
  const me = ranked.find((entry) => entry.is_me);
  const visible = tab === "around" && me ? ranked.filter((entry) => Math.abs(ranked.indexOf(entry) - ranked.indexOf(me)) <= 2) : ranked;
  return <div className="page-width content-page"><div className="page-intro"><div className="eyebrow"><span className="eyebrow-dot" /> SAMPLE COMPETITION</div><h1>The little things add up.</h1><p>Less force wins. Fewer tiles break a tie. Then it comes down to travel time. These standings are sample data.</p></div><div className="leaderboard-summary"><div className="leaderboard-trophy"><Trophy size={26} /></div><div><span className="section-kicker">DEMO LEADERBOARD</span><h2>{puzzle.title}</h2><p>{prettyDate(puzzle.active_date)} · {puzzle.puzzle_id.startsWith("daily-") ? "Live-style sample" : "Historical sample"}</p></div><select aria-label="Choose puzzle leaderboard" value={puzzleId} onChange={(event) => setPuzzleId(event.target.value)}>{allPuzzles().map((item) => <option key={item.puzzle_id} value={item.puzzle_id}>{item.title}</option>)}</select></div><div className="board-card"><div className="board-toolbar"><div className="tabs" role="tablist" aria-label="Leaderboard view"><button role="tab" aria-selected={tab === "top"} className={tab === "top" ? "active" : ""} onClick={() => setTab("top")}><Medal size={16} /> Top players</button><button role="tab" aria-selected={tab === "around"} className={tab === "around" ? "active" : ""} onClick={() => setTab("around")}><Users size={16} /> Around me</button></div><span className="sample-label">SAMPLE DATA</span></div>{tab === "around" && !me ? <div className="board-empty"><LockKeyhole size={27} /><h3>Your spot is waiting.</h3><p>Use a demo account and solve the sample layout to see an example around-me view.</p><Link className="secondary-button" href={user ? "/" : "/sign-in"}>{user ? "Play today" : "Demo sign in"} <ArrowRight size={16} /></Link></div> : <div className="table-scroll"><table className="leaderboard-table"><thead><tr><th>RANK</th><th>PLAYER</th><th>FORCE</th><th>TILES</th><th>TIME</th><th>LAYOUT</th></tr></thead><tbody>{visible.map((entry) => <tr key={entry.user_id} className={entry.is_me ? "my-row" : ""}><td><span className={entry.rank === 1 ? "rank first" : "rank"}>#{entry.rank}</span></td><td><strong>{entry.name}</strong>{entry.is_me && <span className="you-tag">YOU</span>}</td><td>{(entry.force_cost_mn / 1000).toFixed(0)} N</td><td>{entry.tile_count}</td><td>{secondsForStep(entry.finish_step)}s</td><td>{result ? <Link className="table-link" href={`/result/${puzzleId}?player=${entry.user_id}`}>View <ArrowRight size={14} /></Link> : <span className="locked-layout"><LockKeyhole size={14} /> Solve first</span>}</td></tr>)}</tbody></table></div>}</div>{me && <div className="your-standing"><div><span>YOUR DEMO STANDING</span><strong>#{me.rank} <span>·</span> {percentile(ranked, me)}th percentile</strong></div><p>May change in this local sample. No official daily rank is assigned.</p></div>}<div className="info-banner"><LockKeyhole size={18} /><span>Player layouts unlock in the UI only after your local demo solve. A future backend must enforce that access independently.</span></div></div>;
}
