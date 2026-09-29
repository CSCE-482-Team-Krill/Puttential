"use client";

import { useQuery } from "@tanstack/react-query";
import { GameExperience } from "@/components/game-experience";
import { mockGameData } from "@/lib/mock-services";

export default function TodayPage() {
  const { data, isPending } = useQuery({ queryKey: ["today"], queryFn: () => mockGameData.getToday() });
  return isPending || !data ? <div className="page-width page-loading">Preparing today’s course…</div> : <GameExperience puzzle={data} />;
}
