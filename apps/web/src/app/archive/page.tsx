"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Check, LockKeyhole, Play } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { prettyDate } from "@/lib/fixtures";
import { mockGameData } from "@/lib/mock-services";

export default function ArchivePage() {
  const { data: puzzles = [] } = useQuery({ queryKey: ["archive"], queryFn: () => mockGameData.getArchive() });
  const results = useAppStore((state) => state.results);
  return <div className="page-width content-page"><div className="page-intro"><div className="eyebrow"><span className="eyebrow-dot" /> THE COURSE LIBRARY</div><h1>Every day, a new angle.</h1><p>Missed one? Explore past demo courses at your own pace. Late solves stay separate from their original daily boards.</p></div><div className="archive-grid">{puzzles.map((puzzle, index) => { const solved = !!results[puzzle.puzzle_id]; return <Link className="archive-card" key={puzzle.puzzle_id} href={`/archive/${puzzle.puzzle_id}`}><div className={`archive-art archive-art-${index}`}><div className="archive-path" /><div className="archive-ball" /><div className="archive-hole" /><span className="archive-number">0{index + 1}</span></div><div className="archive-card-body"><div className="archive-date"><CalendarDays size={15} /> {prettyDate(puzzle.active_date)}</div><div className="archive-title-row"><h2>{puzzle.title}</h2><ArrowRight size={20} /></div><p>{puzzle.subtitle}</p><div className="archive-meta"><span className="difficulty-badge">{puzzle.difficulty}</span><span className={solved ? "solved-chip" : "open-chip"}>{solved ? <><Check size={14} /> Solved · playback</> : <><Play size={14} /> Play archive</>}</span></div></div></Link>; })}</div><div className="info-banner"><LockKeyhole size={19} /><span>Previously solved courses open in read-only playback. Archive completions never rewrite the original daily ranking.</span></div></div>;
}
