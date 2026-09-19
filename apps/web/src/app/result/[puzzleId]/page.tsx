"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ResultExperience } from "@/components/result-experience";
import { useAppStore } from "@/lib/app-store";
import { mockGameData } from "@/lib/mock-services";

export default function ResultPage() {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const { data: puzzle } = useQuery({ queryKey: ["puzzle", puzzleId], queryFn: () => mockGameData.getPuzzle(puzzleId) });
  const result = useAppStore((state) => state.results[puzzleId]);
  const hydrated = useAppStore((state) => state.hydrated);
  if (!hydrated || !puzzle) return <div className="page-width page-loading">Loading result…</div>;
  if (!result) return <div className="page-width empty-page"><div className="eyebrow">NO DEMO RESULT YET</div><h1>Your route is still waiting.</h1><p>Play the sample layout to see a local, unofficial result.</p><Link className="primary-button" href={puzzleId.startsWith("daily-") ? "/" : `/archive/${puzzleId}`}>Go to puzzle</Link></div>;
  return <ResultExperience puzzle={puzzle} result={result} archive={!puzzleId.startsWith("daily-")} />;
}
