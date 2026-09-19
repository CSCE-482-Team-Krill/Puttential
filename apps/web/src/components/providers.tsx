"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/app-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } }));
  const hydrate = useAppStore((state) => state.hydrate);
  const reducedMotion = useAppStore((state) => state.preferences.reducedMotion);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(reducedMotion); }, [reducedMotion]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
