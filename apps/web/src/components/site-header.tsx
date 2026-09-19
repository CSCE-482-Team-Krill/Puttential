"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, ChartNoAxesColumn, CircleUserRound, Home, Settings2, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/app-store";

const links = [
  { href: "/", label: "Today", icon: Home },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/leaderboard", label: "Leaderboard", icon: ChartNoAxesColumn },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
];

export function SiteHeader() {
  const path = usePathname();
  const user = useAppStore((state) => state.user);
  return <>
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Puttential home"><span className="brand-mark"><span className="brand-ball" /></span><span>puttential<span className="brand-period">.</span></span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">{links.map(({ href, label }) => <Link key={href} href={href} className={path === href || (href !== "/" && path.startsWith(href + "/")) ? "nav-link active" : "nav-link"}>{label}</Link>)}</nav>
        <div className="header-actions"><span className="demo-pill"><Sparkles size={13} /> DEMO MODE</span><Link href="/settings" className="icon-button" aria-label="Settings"><Settings2 size={19} /></Link><Link href={user ? "/profile" : "/sign-in"} className="avatar-button" aria-label={user ? "Your profile" : "Sign in"}>{user ? user.name.slice(0, 1).toUpperCase() : <CircleUserRound size={21} />}</Link></div>
      </div>
    </header>
    <nav className="mobile-nav" aria-label="Mobile navigation">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href || (href !== "/" && path.startsWith(href + "/")) ? "mobile-nav-link active" : "mobile-nav-link"}><Icon size={20} /><span>{label}</span></Link>)}</nav>
  </>;
}
