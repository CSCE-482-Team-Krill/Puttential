import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Puttential — A little push changes everything",
  description: "A playful frontend demo for a daily physics puzzle. All results are local and unofficial.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers><SiteHeader /><main id="main-content">{children}</main><footer className="site-footer"><div className="page-width"><span>puttential<span className="brand-period">.</span></span><span>Frontend demo · No official results or accounts yet</span></div></footer></Providers></body></html>;
}
