"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, CalendarDays, ChartNoAxesColumn, Flame, Settings2, Trophy } from "lucide-react";
import { useAppStore } from "@/lib/app-store";

const links = [
  { href: "/", label: "Daily", icon: CalendarDays },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/profile", label: "Stats", icon: ChartNoAxesColumn },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const linkClass = (path: string, href: string, base: string) =>
  `${base}${path === href || (href !== "/" && path.startsWith(`${href}/`)) ? " active" : ""}`;

export function SiteHeader() {
  const path = usePathname();
  const user = useAppStore((state) => state.user);
  return <header className="site-header">
    <div className="header-inner">
      <Link className="brand" href="/" aria-label="Puttential home"><span className="brand-mark"><span className="brand-ball" /></span><span>puttential<span className="brand-period">.</span></span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} title={label} aria-label={label} className={linkClass(path, href, "nav-link")}><Icon size={19} /><span>{label}</span></Link>)}</nav>
      <div className="header-actions"><Link href={user ? "/profile" : "/sign-in"} className="streak-pill" aria-label={user ? "View your 14 day streak" : "Sign in to start a streak"}><Flame size={15} fill="currentColor" /><span>{user ? "14 day streak" : "Start a streak"}</span></Link></div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.slice(1).map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-label={label} className={linkClass(path, href, "mobile-nav-link")}><Icon size={18} /></Link>)}
      </nav>
    </div>
  </header>;
}
