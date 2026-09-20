"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, ChartNoAxesColumn, CircleUserRound, Home, Settings2 } from "lucide-react";
import { useAppStore } from "@/lib/app-store";

const links = [
  { href: "/", label: "Today", icon: Home },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/leaderboard", label: "Leaderboard", icon: ChartNoAxesColumn },
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
      <div className="header-actions"><Link href="/settings" className="icon-button" aria-label="Settings"><Settings2 size={19} /></Link><Link href={user ? "/profile" : "/sign-in"} className="avatar-button" aria-label={user ? "Your profile" : "Sign in"}>{user ? user.name.slice(0, 1).toUpperCase() : <CircleUserRound size={20} />}</Link></div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.slice(1).map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-label={label} className={linkClass(path, href, "mobile-nav-link")}><Icon size={19} /></Link>)}
        <Link href={user ? "/profile" : "/sign-in"} aria-label={user ? "Your profile" : "Sign in"} className={linkClass(path, user ? "/profile" : "/sign-in", "mobile-nav-link")}><CircleUserRound size={19} /></Link>
        <Link href="/settings" aria-label="Settings" className={linkClass(path, "/settings", "mobile-nav-link")}><Settings2 size={19} /></Link>
      </nav>
    </div>
  </header>;
}
