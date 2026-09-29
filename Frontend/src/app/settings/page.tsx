"use client";

import { Grid2X2, ScanSearch, SlidersHorizontal, Sparkles, Trash2, Type } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { Preferences } from "@/lib/types";

const options: { key: keyof Preferences; title: string; description: string; icon: typeof Grid2X2 }[] = [
  { key: "grid", title: "Reference grid", description: "Show a light measurement grid over the course.", icon: Grid2X2 },
  { key: "coordinates", title: "Coordinate readout", description: "Show world-unit context while placing tiles.", icon: ScanSearch },
  { key: "labels", title: "Course labels", description: "Show names and force magnitudes in the scene.", icon: Type },
  { key: "reducedMotion", title: "Reduced motion", description: "Keep interface transitions quiet and simple.", icon: Sparkles },
];
export default function SettingsPage() {
  const preferences = useAppStore((state) => state.preferences);
  const setPreference = useAppStore((state) => state.setPreference);
  const resetDemo = useAppStore((state) => state.resetDemo);
  return <div className="page-width content-page narrow-page"><div className="page-intro"><div className="eyebrow"><span className="eyebrow-dot" /> MAKE IT YOURS</div><h1>Course settings.</h1><p>These visual preferences are saved locally on this device.</p></div><div className="settings-card"><div className="settings-heading"><SlidersHorizontal size={22} /><div><h2>Display and controls</h2><p>Make the course comfortable to explore.</p></div></div>{options.map(({ key, title, description, icon: Icon }) => <label className="setting-row" key={key}><span className="setting-icon"><Icon size={21} /></span><span className="setting-copy"><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreference(key, event.target.checked)} /><span className="switch" aria-hidden="true" /></label>)}</div><div className="settings-card reset-card"><div><h2>Start fresh</h2><p>Clear all local demo accounts, solved courses, drafts, editor work, and preferences on this device.</p></div><button className="subtle-button danger" onClick={() => { if (window.confirm("Clear all Puttential demo data on this device?")) void resetDemo().then(() => { window.location.href = "/"; }); }}><Trash2 size={17} /> Clear demo data</button></div><div className="info-banner"><span>All settings affect this frontend demo only. Audio and physics preferences will be added with those systems.</span></div></div>;
}
