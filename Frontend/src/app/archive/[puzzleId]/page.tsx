"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { GameExperience } from "@/components/game-experience";
import { ResultExperience } from "@/components/result-experience";
import { useAppStore } from "@/lib/app-store";
import { mockGameData } from "@/lib/mock-services";

export default function ArchiveDetailPage() {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const { data: puzzle, isPending } = useQuery({ queryKey: ["puzzle", puzzleId], queryFn: () => mockGameData.getPuzzle(puzzleId) });
  const result = useAppStore((state) => state.results[puzzleId]);
  const hydrated = useAppStore((state) => state.hydrated);
  if (isPending || !hydrated) return <div className="page-width page-loading">Opening course…</div>;
  if (!puzzle) return <div className="page-width empty-page"><h1>Course not found.</h1><Link className="primary-button" href="/archive">Back to archive</Link></div>;
  return result ? <ResultExperience puzzle={puzzle} result={result} archive /> : <GameExperience puzzle={puzzle} archive />;
}
