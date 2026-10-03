"use client";

import { useEffect, useState } from "react";
import { forceDensity, shapePolygon } from "@game";
import type { FieldZoneDefinition, Level } from "@game";
import { CourseCanvas } from "./course-canvas";
import { LEVELS } from "./levels";
import { usePuzzle } from "./puzzle";
import type { RunResult } from "./puzzle";

type Panel = "archive" | "stats" | "leaderboard" | "settings" | "help" | "result" | null;
type IconName = "home" | "calendar" | "stats" | "trophy" | "settings" | "help" | "close" | "arrow" | "reset" | "play" | "fire";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M7 14h6M7 17h4" /></>,
    stats: <><rect x="3" y="13" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="13" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></>,
    trophy: <><path d="M7 3h10v7a5 5 0 0 1-10 0zM7 5H4v3a4 4 0 0 0 4 4M17 5h3v3a4 4 0 0 1-4 4M12 15v4M8 21h8M10 19h4" /></>,
    settings: <><path d="m9.5 3-.5 2a7 7 0 0 0-1.5.9l-2-.6-2.5 4.4 1.5 1.4a7 7 0 0 0 0 1.8L3 14.3l2.5 4.4 2-.6a7 7 0 0 0 1.5.9l.5 2h5l.5-2a7 7 0 0 0 1.5-.9l2 .6 2.5-4.4-1.5-1.4a7 7 0 0 0 0-1.8L21 9.7l-2.5-4.4-2 .6A7 7 0 0 0 15 5l-.5-2z" /><circle cx="12" cy="12" r="3" /></>,
    help: <><circle cx="12" cy="12" r="10" /><path d="M9.2 9a3 3 0 0 1 5.6 1.5c0 2-2.8 2.5-2.8 4.5M12 18h.01" /></>,
    close: <path d="M5 5 19 19M19 5 5 19" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    reset: <><path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7" /></>,
    play: <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />,
    fire: <path d="M12 22c4.5 0 7-3 7-7 0-2.5-1.2-4.7-3-6-.2 2.5-1.7 3.7-2.6 4C14 8.5 11.4 5.2 9 3c.4 4-3 6.2-4 9.4C3.3 17.7 6.4 22 12 22z" />,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const rankings = [
  { rank: "01", name: "birdbrain", force: 2, fields: 1, time: "4.82s" },
  { rank: "02", name: "physwiz", force: 3, fields: 2, time: "3.14s" },
  { rank: "03", name: "krillking", force: 3, fields: 2, time: "5.26s" },
  { rank: "•••", name: "", force: "", fields: "", time: "" },
  { rank: "218", name: "You", force: 5, fields: 3, time: "6.31s" },
];

function fieldName(id: string): string {
  const words = id.replace(/-field$/, "").split("-");
  return words.map((word, index) => (index === 0 ? word[0]!.toUpperCase() + word.slice(1) : word)).join(" ");
}

const KIND_GLYPHS: Readonly<Record<string, string>> = { attractor: "◎", repulsor: "✺", vortex: "↺", drag: "≋" };

/** A compact glyph for the field list; directional forces show their direction at the field's center. */
function fieldGlyph(field: FieldZoneDefinition): string {
  const glyph = KIND_GLYPHS[field.force.kind];
  if (glyph !== undefined) return glyph;
  const polygon = shapePolygon(field.shape);
  const xs = polygon.map((point) => point.x), ys = polygon.map((point) => point.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const force = forceDensity(field.force)({ point: center, velocity: { x: 0, y: 0 }, density: 1 });
  const arrows = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];
  const octant = Math.round(Math.atan2(force.y, force.x) / (Math.PI / 4) + field.angle / (Math.PI / 4));
  return arrows[((octant % 8) + 8) % 8]!;
}

function Modal({ panel, close, reducedMotion, setReducedMotion, result, currentLevel, chooseLevel }: { panel: Exclude<Panel, null>; close: () => void; reducedMotion: boolean; setReducedMotion: (value: boolean) => void; result: RunResult | null; currentLevel: Level; chooseLevel: (level: Level) => void }) {
  const [sound, setSound] = useState(true);
  const titles: Record<Exclude<Panel, null>, string> = {
    archive: "Puzzle archive", stats: "Your stats", leaderboard: "Leaderboard", settings: "Settings", help: "How to play", result: result?.solved === false ? "So close" : "Nice work!",
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header"><div><span className="eyebrow">PUTTENTIAL</span><h2 id="modal-title">{titles[panel]}</h2></div><button className="icon-button close-button" onClick={close} aria-label="Close panel"><Icon name="close" /></button></div>
        {panel === "archive" && <div className="modal-body"><p className="muted">Past puzzles are ready whenever you are.</p><div className="archive-list">{LEVELS.map(({ level, day }, index) => <button className="archive-row" key={level.id} onClick={() => { chooseLevel(level); close(); }}><span className="archive-number">#{126 - index}</span><span>{day} · {level.name}</span><span className="row-status">{level === currentLevel ? "Playing" : "Play"}</span></button>)}</div></div>}
        {panel === "stats" && <div className="modal-body"><p className="muted">Your progress at a glance. These are sample results.</p><div className="stat-grid"><div className="stat-card"><strong>14</strong><span>Current streak</span></div><div className="stat-card"><strong>87</strong><span>Games played</span></div><div className="stat-card"><strong>78%</strong><span>Avg. percentile</span></div><div className="stat-card"><strong>4.2</strong><span>Avg. attempts</span></div></div><h3>Recent scores</h3><div className="score-bars"><div><span>Mon</span><i style={{height:"68%"}} /><b>68</b></div><div><span>Tue</span><i style={{height:"82%"}} /><b>82</b></div><div><span>Wed</span><i style={{height:"74%"}} /><b>74</b></div><div><span>Thu</span><i style={{height:"91%"}} /><b>91</b></div><div><span>Fri</span><i style={{height:"79%"}} /><b>79</b></div><div><span>Sat</span><i style={{height:"88%"}} /><b>88</b></div><div><span>Sun</span><i style={{height:"94%"}} /><b>94</b></div></div></div>}
        {panel === "leaderboard" && <div className="modal-body"><p className="muted">Today&apos;s best solutions · sample rankings</p><div className="leaderboard-head"><span>RANK / PLAYER</span><span>FORCE</span><span>FIELDS</span><span>TIME</span></div><div className="leaderboard-list">{rankings.map((entry, index) => <div className={`leaderboard-row ${entry.name === "You" ? "your-row" : ""}`} key={index}><span><b>{entry.rank}</b> {entry.name}</span><span>{entry.force}</span><span>{entry.fields}</span><span>{entry.time}</span></div>)}</div><p className="modal-footnote">Solutions unlock after you solve the daily puzzle.</p></div>}
        {panel === "settings" && <div className="modal-body"><p className="muted">Make the preview feel right for you.</p><div className="setting-row"><div><strong>Sound effects</strong><span>Play sounds during a run</span></div><button className={`switch ${sound ? "on" : ""}`} role="switch" aria-checked={sound} aria-label="Sound effects" onClick={() => setSound(!sound)}><span /></button></div><div className="setting-row"><div><strong>Reduced motion</strong><span>Use simpler animations</span></div><button className={`switch ${reducedMotion ? "on" : ""}`} role="switch" aria-checked={reducedMotion} aria-label="Reduced motion" onClick={() => setReducedMotion(!reducedMotion)}><span /></button></div><p className="modal-footnote">Settings are for this mockup and are not saved yet.</p></div>}
        {panel === "help" && <div className="modal-body"><p className="muted">Get the ball into the cup using the fewest forces you can.</p><div className="steps"><div><b>01</b><span><strong>Study the course</strong><small>Look for terrain, walls, and the goal.</small></span></div><div><b>02</b><span><strong>Place force fields</strong><small>Pick fields from your toolkit, then drag them on the course.</small></span></div><div><b>03</b><span><strong>Press Play</strong><small>Watch the ball move, then improve your plan.</small></span></div></div><p className="modal-footnote">A field pushes only the part of the ball it overlaps. Hold the ball in the goal to finish.</p></div>}
        {panel === "result" && result && <div className="modal-body result-body"><div className="result-trophy">{result.solved ? "🏆" : "⛳"}</div><p>{result.solved ? "The ball held in the goal." : "The ball stopped short of the goal. Adjust your fields and try again."}</p><div className="result-grid"><div><strong>{result.fields}</strong><span>Fields used</span></div><div><strong>{result.seconds.toFixed(2)}s</strong><span>Time</span></div></div><button className="primary-button" onClick={close}>Back to course <Icon name="arrow" size={18} /></button></div>}
      </section>
    </div>
  );
}

export default function Home() {
  const [panel, setPanel] = useState<Panel>(null);
  const [level, setLevel] = useState<Level>(LEVELS[0]!.level);
  const [reducedMotion, setReducedMotion] = useState(false);
  const puzzle = usePuzzle(level);
  const nav: { name: Exclude<Panel, "result" | null> | "daily"; label: string; icon: IconName }[] = [
    { name: "daily", label: "Daily", icon: "calendar" }, { name: "archive", label: "Archive", icon: "calendar" }, { name: "stats", label: "Stats", icon: "stats" }, { name: "leaderboard", label: "Leaderboard", icon: "trophy" }, { name: "settings", label: "Settings", icon: "settings" },
  ];

  useEffect(() => {
    if (puzzle.result !== null) setPanel("result");
  }, [puzzle.result]);

  const playLabel = puzzle.mode === "running" ? "Stop" : puzzle.mode === "done" ? "Try again" : "Play";
  const onPlay = () => {
    if (puzzle.mode === "setup") puzzle.play();
    else puzzle.rewind();
  };

  return <div className={`site-wrap ${reducedMotion ? "reduce-motion" : ""}`}>
    <header className="site-header">
      <button className="brand" onClick={() => setPanel(null)} aria-label="Puttential home"><span className="brand-mark"><span className="brand-ball" /><span className="brand-flag" /></span><span>Puttential<span className="brand-dot">.</span></span></button>
      <nav className="main-nav" aria-label="Main navigation">{nav.map((item) => <button key={item.name} className={`nav-button ${panel === item.name || (item.name === "daily" && panel === null) ? "active" : ""}`} onClick={() => { if (item.name === "daily") setLevel(LEVELS[0]!.level); setPanel(item.name === "daily" ? null : item.name); }}><Icon name={item.icon} size={18} /><span>{item.label}</span></button>)}</nav>
      <button className="streak-pill" onClick={() => setPanel("stats")}><Icon name="fire" size={17} /> <strong>14</strong><span>day streak</span></button>
    </header>

    <main className="dashboard">
      <div className="page-heading"><div><span className="eyebrow">TUESDAY • SEPTEMBER 22, 2026</span><h1>Daily challenge <span>#126</span></h1><p>One course. Your own way to the cup.</p></div><button className="how-button" onClick={() => setPanel("help")}><Icon name="help" size={18} /> How to play</button></div>

      <div className="game-layout">
        <section className="game-card" aria-labelledby="course-title"><div className="card-heading"><div><span className="section-kicker">{level === LEVELS[0]!.level ? "TODAY'S COURSE" : "ARCHIVE COURSE"}</span><h2 id="course-title">{level.name}</h2></div><span className="difficulty"><span /> MODERATE</span></div><div className="course"><div className="course-grid" /><CourseCanvas level={level} frameRef={puzzle.frameRef} draft={puzzle.draft} mode={puzzle.mode} trail={puzzle.trail} onMoveField={puzzle.moveField} /></div><div className="game-toolbar"><div className="course-legend"><span><i className="legend-ball" /> {fieldName(level.goal.bodyId)}</span><span><i className="legend-field" /> Force field</span><span><i className="legend-goal" /> Goal</span></div><span className="demo-note">{puzzle.mode === "setup" ? (Object.values(puzzle.draft).some((field) => field.enabled) ? "Drag fields to move them" : "Pick a field to add it") : puzzle.mode === "running" ? "Simulation running" : puzzle.mode === "loading" ? "Loading course…" : "Run finished"}</span></div></section>

        <aside className="control-column"><section className="control-card"><div className="control-heading"><span className="section-kicker">YOUR TOOLKIT</span><h2>Force fields</h2><p>Pick a field to add it to the course.</p></div><div className="field-list">{level.fields.map((field) => { const enabled = puzzle.draft[field.id]?.enabled ?? false; return <button className={`field-option ${enabled ? "selected" : ""}`} key={field.id} disabled={puzzle.mode !== "setup"} onClick={() => puzzle.toggleField(field.id)} aria-pressed={enabled}><span className="field-arrows">{fieldGlyph(field)}</span><span className="field-info"><strong>{fieldName(field.id)}</strong><small>{enabled ? "ON" : "OFF"} · {field.force.kind.toUpperCase()}</small></span></button>; })}</div><div className="attempt-line"><span>Attempts today</span><strong>{puzzle.attempts}</strong></div><button className="primary-button play-button" disabled={puzzle.mode === "loading"} onClick={onPlay}><Icon name={puzzle.mode === "setup" ? "play" : "reset"} size={20} /> {playLabel} <Icon name="arrow" size={19} /></button><button className="text-button" disabled={puzzle.mode === "loading"} onClick={puzzle.resetLayout}><Icon name="reset" size={16} /> Reset layout</button></section><div className="tip-card"><span className="tip-icon">✦</span><div><strong>Today&apos;s tip</strong><p>The dotted line previews the first second of your run. After that, you&apos;re on your own.</p></div></div></aside>
      </div>

      <section className="bottom-strip" aria-label="Daily progress"><div><span className="strip-icon green"><Icon name="calendar" /></span><span><strong>One puzzle each day</strong><small>Come back tomorrow for a new course.</small></span></div><div><span className="strip-icon yellow"><Icon name="trophy" /></span><span><strong>Find your best solution</strong><small>Use less force to climb the leaderboard.</small></span></div><div><span className="strip-icon coral"><Icon name="fire" /></span><span><strong>Keep the streak alive</strong><small>You&apos;re on a 14 day run.</small></span></div></section>
    </main>
    {panel && <Modal panel={panel} close={() => setPanel(null)} reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} result={puzzle.result} currentLevel={level} chooseLevel={setLevel} />}
  </div>;
}
