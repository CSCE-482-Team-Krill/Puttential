"use client";

import { useEffect, useState } from "react";
import { cornerPocket, exampleBarPuzzle, keyTurn, radialRelay, spinCycle } from "@game";
import type { FieldZoneDefinition, Level } from "@game";
import { CourseCanvas } from "./course-canvas";
import { usePuzzle } from "./puzzle";
import { Icon } from "./ui-icon";
import type { IconName } from "./ui-icon";
import { Modal, usePreferences } from "./modal";
import type { Panel } from "./modal";

/** Today's puzzle first; the archive lists the rest. */
/** Every tile adds the same amount to a solution's force cost. */
const TILE_COST = 1;

const LEVELS: readonly { level: Level; day: string }[] = [
  { level: exampleBarPuzzle, day: "Today" },
  { level: radialRelay, day: "Yesterday" },
  { level: spinCycle, day: "Sep 20" },
  { level: keyTurn, day: "Sep 19" },
  { level: cornerPocket, day: "Sep 18" },
];

function fieldName(id: string): string {
  const words = id.replace(/-field$/, "").split("-");
  return words.map((word, index) => (index === 0 ? word[0]!.toUpperCase() + word.slice(1) : word)).join(" ");
}

const KIND_GLYPHS: Readonly<Record<string, string>> = { attractor: "◎", repulsor: "✺", vortex: "↺", drag: "≋" };

/** A compact glyph for the tile list; directional forces show their direction at the field's center. */
function fieldGlyph(field: FieldZoneDefinition): string {
  const glyph = KIND_GLYPHS[field.force.kind];
  if (glyph !== undefined) return glyph;
  const xs = field.localPolygon.map((point) => point.x), ys = field.localPolygon.map((point) => point.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const force = field.force.densityAt({ point: center, velocity: { x: 0, y: 0 }, density: 1 });
  const arrows = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];
  const octant = Math.round(Math.atan2(force.y, force.x) / (Math.PI / 4) + field.angle / (Math.PI / 4));
  return arrows[((octant % 8) + 8) % 8]!;
}

export default function Home() {
  const [panel, setPanel] = useState<Panel>(null);
  const [level, setLevel] = useState<Level>(LEVELS[0]!.level);
  const [preferences, setPreferences] = usePreferences();
  const puzzle = usePuzzle(level);
  const nav: { name: Exclude<Panel, "result" | null>; label: string; icon: IconName }[] = [
    { name: "archive", label: "Calendar", icon: "calendar" },
    { name: "leaderboard", label: "Leaderboard", icon: "trophy" },
    { name: "settings", label: "Settings", icon: "settings" },
    { name: "stats", label: "Profile", icon: "profile" },
    { name: "help", label: "Help", icon: "help" },
  ];

  useEffect(() => {
    if (puzzle.result !== null) setPanel("result");
  }, [puzzle.result]);

  const playLabel = puzzle.mode === "running" ? "Stop" : puzzle.mode === "done" ? "Try again" : "Play";
  const onPlay = () => {
    if (puzzle.mode === "setup") puzzle.play();
    else puzzle.rewind();
  };

  const placedTiles = Object.values(puzzle.draft).filter((field) => field.enabled).length;
  const levelIndex = LEVELS.findIndex((entry) => entry.level === level);
  const status = puzzle.mode === "loading" ? "Loading course…"
    : puzzle.mode === "running" ? "Simulation running"
    : puzzle.mode === "done" ? "Run finished"
    : placedTiles > 0 ? "Drag fields on the course to move them." : "Choose a force block to get started.";

  return (
    <div className={`site-wrap ${preferences.reducedMotion ? "reduce-motion" : ""}`}>
      <header className="site-header">
        <button className="brand" onClick={() => { setLevel(LEVELS[0]!.level); setPanel(null); }} aria-label="Puttential home">
          <span className="brand-mark"><span className="brand-ball" /><span className="brand-flag" /></span>
          <span>Puttential<span className="brand-dot">.</span></span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <button key={item.name} className={`nav-button ${panel === item.name ? "active" : ""}`} onClick={() => setPanel(item.name)} aria-expanded={panel === item.name}>
              <Icon name={item.icon} size={23} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="dashboard">
        <div className="game-layout">
          <section className="play-column" aria-labelledby="course-title">
            <div className="course-stage">
              <div className="course-heading">
                <span className="challenge-label"><Icon name="calendar" size={16} /> {levelIndex === 0 ? "Daily challenge" : "Archive challenge"} <b>#{126 - levelIndex}</b></span>
                <span className={`course-status ${puzzle.mode === "running" ? "running" : ""}`}><i /> {puzzle.mode === "setup" ? "Planning" : puzzle.mode === "running" ? "In motion" : puzzle.mode === "done" ? "Finished" : "Loading"}</span>
              </div>
              <div className="course">
                <div className="course-grid" />
                <CourseCanvas level={level} frameRef={puzzle.frameRef} draft={puzzle.draft} mode={puzzle.mode} trail={preferences.showPreview ? puzzle.trail : []} onMoveField={puzzle.moveField} />
              </div>
            </div>

            <div className="course-details">
              <div className="details-heading">
                <div><span className="section-kicker">{levelIndex === 0 ? "TODAY'S COURSE" : "FROM THE ARCHIVE"}</span><h1 id="course-title">{level.name}</h1><p>One course. Your own way to the goal.</p></div>
                <button className="how-button" onClick={() => setPanel("help")} aria-label="How to play"><Icon name="help" size={17} /><span>How to play</span></button>
              </div>
              <div className="run-controls">
                <dl className="run-metrics" aria-label="Current solution">
                  <div><dt>Force cost</dt><dd>{placedTiles * TILE_COST}<small>pt</small></dd></div>
                  <div><dt>Blocks placed</dt><dd>{placedTiles}<small>/ {level.fields.length}</small></dd></div>
                  <div><dt>Attempts</dt><dd>{puzzle.attempts}</dd></div>
                </dl>
                <div className="run-actions">
                  <button className="text-button" disabled={puzzle.mode === "loading"} onClick={puzzle.resetLayout}><Icon name="reset" size={17} /> Reset layout</button>
                  <button className="primary-button play-button" disabled={puzzle.mode === "loading"} onClick={onPlay}><Icon name={puzzle.mode === "setup" ? "play" : "reset"} size={20} /> {playLabel}</button>
                </div>
              </div>
              <div className="game-toolbar">
                <div className="course-legend"><span><i className="legend-ball" /> {fieldName(level.goal.bodyId)}</span><span><i className="legend-field" /> Force field</span><span><i className="legend-goal" /> Goal</span></div>
                <span className="demo-note" role="status">{status}</span>
              </div>
            </div>
          </section>

          <aside className="control-column" aria-labelledby="toolkit-title">
            <div className="control-heading"><span className="section-kicker">YOUR TOOLKIT</span><div className="toolkit-title"><h2 id="toolkit-title">Force blocks</h2><span className="inventory-count">{level.fields.length}</span></div><p>Choose a block, then drag its field into position on the course.</p></div>
            <div className="tile-list">
              {level.fields.map((field) => {
                const enabled = puzzle.draft[field.id]?.enabled ?? false;
                return (
                  <button className={`tile-option ${enabled ? "selected" : ""}`} key={field.id} disabled={puzzle.mode !== "setup"} onClick={() => puzzle.toggleField(field.id)} aria-pressed={enabled}>
                    <span className="tile-arrows" aria-hidden="true">{fieldGlyph(field)}</span>
                    <span className="tile-info"><strong>{fieldName(field.id)}</strong><small>{field.force.kind === "uniform" ? "Directional force" : field.force.kind === "attractor" ? "Pull toward center" : field.force.kind === "repulsor" ? "Push from center" : field.force.kind}</small><span className="tile-state">{enabled ? "Placed · click to remove" : "Click to place"}</span></span>
                    <span className="tile-cost">{TILE_COST} pt</span>
                  </button>
                );
              })}
            </div>
            <p className="toolkit-note">Every block costs 1 point. Use fewer to improve your solution.</p>
            <div className="tip-card"><span className="tip-icon">✦</span><div><strong>A little foresight</strong><p>The dotted path previews the first second of your run. Adjust your fields before pressing Play.</p></div></div>
            <div className="toolkit-footer"><Icon name="trophy" size={18} /><span>Small moves. Better solutions.</span></div>
          </aside>
        </div>
      </main>
      {panel && <Modal key={panel} panel={panel} close={() => setPanel(null)} preferences={preferences} setPreferences={setPreferences} result={puzzle.result} levels={LEVELS} currentLevel={level} chooseLevel={setLevel} tileCost={TILE_COST} />}
    </div>
  );
}
