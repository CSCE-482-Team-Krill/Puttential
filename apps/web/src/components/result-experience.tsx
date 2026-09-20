"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronLeft, Copy, LockKeyhole, Pause, Play, RotateCcw, Share2, Sparkles, Trophy } from "lucide-react";
import { CourseCanvas } from "./course-canvas";
import { useAppStore } from "@/lib/app-store";
import { prettyDate } from "@/lib/fixtures";
import { percentile } from "@/lib/leaderboard";
import { secondsForStep } from "@/lib/geometry";
import { DemoSimulation, mockGameData } from "@/lib/mock-services";
import type { DemoResult, Placement, PuzzleDefinition, RunSnapshot } from "@/lib/types";

export function ResultExperience({ puzzle, result, archive = false }: { puzzle: PuzzleDefinition; result: DemoResult; archive?: boolean }) {
  const user = useAppStore((state) => state.user);
  const prefs = useAppStore((state) => state.preferences);
  const [player, setPlayer] = useState("demo-me");
  const [playbackPlacements, setPlaybackPlacements] = useState<Placement[]>(result.placements);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [playbackState, setPlaybackState] = useState<"idle" | "playing" | "paused">("idle");
  const [rate, setRate] = useState<0.5 | 1 | 2>(1);
  const [shareMessage, setShareMessage] = useState("");
  const simulation = useRef<DemoSimulation | null>(null);
  const { data: board = [] } = useQuery({ queryKey: ["leaderboard", puzzle.puzzle_id, user?.id, result.solved_at], queryFn: () => mockGameData.getLeaderboard(puzzle.puzzle_id, user, result) });
  const me = board.find((entry) => entry.is_me);
  useEffect(() => { const queryPlayer = new URLSearchParams(window.location.search).get("player"); if (queryPlayer) setPlayer(queryPlayer); return () => simulation.current?.abort(); }, []);
  useEffect(() => {
    simulation.current?.abort(); setSnapshot(null); setPlaybackState("idle");
    if (player === "demo-me") { setPlaybackPlacements(result.placements); return; }
    void mockGameData.getPlayback(puzzle, true, player).then(setPlaybackPlacements).catch(() => setPlaybackPlacements(result.placements));
  }, [player, puzzle, result.placements]);
  const playerName = player === "demo-me" ? "Your layout" : `${board.find((entry) => entry.user_id === player)?.name ?? "Player"}’s sample layout`;
  const start = () => { simulation.current?.abort(); setSnapshot(null); const run = new DemoSimulation(puzzle, playbackPlacements); simulation.current = run; run.setRate(rate); setPlaybackState("playing"); run.start(setSnapshot, () => setPlaybackState("idle")); };
  const pause = () => { if (playbackState === "playing") { simulation.current?.pause(); setPlaybackState("paused"); } else if (playbackState === "paused") { simulation.current?.resume(); setPlaybackState("playing"); } };
  const reset = () => { simulation.current?.abort(); setSnapshot(null); setPlaybackState("idle"); };
  const shareText = `PUTTENTIAL\n${result.force_cost_mn / 1000} N · ${result.tile_count} tiles · ${secondsForStep(result.finish_step)}s\nFrontend demo — no solution spoilers`;
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: "Puttential demo result", text: shareText }); else { await navigator.clipboard.writeText(shareText); setShareMessage("Non-spoiling result copied."); } }
    catch { setShareMessage("Sharing was cancelled or unavailable."); }
  };
  return <div className="page-width content-page result-page"><Link className="back-link" href={archive ? "/archive" : "/"}><ChevronLeft size={17} /> {archive ? "Back to archive" : "Back to today"}</Link><div className="result-hero"><span className="result-star"><Sparkles size={32} /></span><div className="eyebrow">DEMO COURSE COMPLETE · {prettyDate(puzzle.active_date)}</div><h1>What a lovely line.</h1><p>You found the hole with a carefully placed push. This result lives on this device and is not official.</p></div><div className="result-stats"><div><span>FORCE COST</span><strong>{result.force_cost_mn / 1000} <em>N</em></strong></div><div><span>TILES PLACED</span><strong>{result.tile_count}</strong></div><div><span>BALL TIME</span><strong>{secondsForStep(result.finish_step)} <em>s</em></strong></div><div><span>{user && result.daily_eligible ? "SAMPLE RANK" : "DAILY RANK"}</span><strong>{user && result.daily_eligible && me ? `#${me.rank}` : "—"}</strong></div></div>{user && result.daily_eligible && me && <div className="percentile-banner"><Trophy size={21} /><span>Example standing: <strong>{percentile(board, me)}th percentile</strong>. Demo data can change; no official ranking is recorded.</span></div>}{!user && <div className="info-banner"><LockKeyhole size={19} /><span>Anonymous play keeps a local result, without a public leaderboard position. <Link href="/sign-in">Try demo sign in <ArrowRight size={15} /></Link></span></div>}{!result.daily_eligible && <div className="info-banner"><LockKeyhole size={19} /><span>This late archive solve has no original daily rank or percentile.</span></div>}<div className="result-grid"><section className="playback-card"><div className="playback-heading"><div><span className="section-kicker">READ-ONLY REPLAY</span><h2>{playerName}</h2></div><span className="sample-label">SCRIPTED DEMO</span></div><CourseCanvas puzzle={puzzle} placements={playbackPlacements} snapshot={snapshot} labels={prefs.labels} grid={prefs.grid} /><div className="playback-controls"><button className="primary-button" onClick={playbackState === "idle" ? start : pause}>{playbackState === "playing" ? <Pause size={17} /> : <Play size={17} />}{playbackState === "paused" ? "Resume" : playbackState === "playing" ? "Pause" : "Play replay"}</button><button className="icon-button bordered" onClick={reset} aria-label="Reset replay"><RotateCcw size={17} /></button><div className="speed-row compact"><span>Speed</span><div>{([0.5, 1, 2] as const).map((value) => <button key={value} className={rate === value ? "active" : ""} onClick={() => { setRate(value); simulation.current?.setRate(value); }}>{value}×</button>)}</div></div><span className="playback-time">{snapshot ? `${secondsForStep(snapshot.step)}s` : "0.00s"}</span></div></section><aside className="result-sidebar"><div className="side-card"><span className="section-kicker">SHARE THE MOMENT</span><h2>Good games travel.</h2><p className="side-description">Share your numbers without revealing where you placed a single tile.</p><div className="share-preview"><span>PUTTENTIAL</span><strong>{result.force_cost_mn / 1000} N <i>·</i> {result.tile_count} tiles <i>·</i> {secondsForStep(result.finish_step)}s</strong><small>FRONTEND DEMO · NO SPOILERS</small></div><button className="secondary-button full" onClick={share}><Share2 size={17} /> Share result</button><button className="subtle-button full" onClick={() => { void navigator.clipboard?.writeText(shareText).then(() => setShareMessage("Result text copied.")); }}><Copy size={16} /> Copy text</button>{shareMessage && <p className="game-message" role="status">{shareMessage}</p>}</div><div className="side-card"><span className="section-kicker">COMPARE ROUTES</span><h2>See how others did it.</h2><p className="side-description">Sample layouts unlock here after your local solve. They are examples, not real player solutions.</p><div className="compare-list"><button className={player === "demo-me" ? "active" : ""} onClick={() => setPlayer("demo-me")}><Check size={16} /> Your layout <ArrowRight size={15} /></button>{board.filter((entry) => !entry.is_me).slice(0, 3).map((entry) => <button key={entry.user_id} className={player === entry.user_id ? "active" : ""} onClick={() => setPlayer(entry.user_id)}>{entry.name} · {entry.force_cost_mn / 1000} N <ArrowRight size={15} /></button>)}</div><Link className="text-link" href="/leaderboard">See leaderboard <ArrowRight size={16} /></Link></div></aside></div></div>;
}
