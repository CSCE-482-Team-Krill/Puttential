"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, Flame, HelpCircle, Lightbulb, Pause, Play, RotateCcw, Trash2, Trophy } from "lucide-react";
import { CourseCanvas } from "./course-canvas";
import { useAppStore } from "@/lib/app-store";
import { prettyDate } from "@/lib/fixtures";
import { dequantize, isLegalPlacement, makePlacement, placementPoint, secondsForStep } from "@/lib/geometry";
import { DemoSimulation, mockGameData } from "@/lib/mock-services";
import type { Placement, Point, PuzzleDefinition, RunSnapshot, RunState } from "@/lib/types";

const speeds = [0.5, 1, 2] as const;
const statusLabels: Record<RunState, string> = {
  planning: "PLANNING",
  running: "RUNNING",
  paused: "PAUSED",
  "validation-pending": "CHECKING RESULT",
  "solved-locked": "COURSE LOCKED",
};

export function GameExperience({ puzzle, archive = false }: { puzzle: PuzzleDefinition; archive?: boolean }) {
  const router = useRouter();
  const hydrated = useAppStore((state) => state.hydrated);
  const result = useAppStore((state) => state.results[puzzle.puzzle_id]);
  const savedDraft = useAppStore((state) => state.drafts[puzzle.puzzle_id]);
  const preferences = useAppStore((state) => state.preferences);
  const setDraft = useAppStore((state) => state.setDraft);
  const setResult = useAppStore((state) => state.setResult);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>("planning");
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [rate, setRate] = useState<0.5 | 1 | 2>(1);
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState("");
  const simulation = useRef<DemoSimulation | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; simulation.current?.abort(); }; }, []);
  useEffect(() => { if (hydrated) { setPlacements(result?.placements ?? savedDraft ?? []); setRunState(result ? "solved-locked" : "planning"); } }, [hydrated, puzzle.puzzle_id]);
  const locked = runState === "solved-locked";
  const planning = runState === "planning";
  const selectedPlacement = placements.find((item) => item.tile_id === selectedPlacementId);
  const selectedTile = puzzle.force_tiles.find((item) => item.tile_id === selectedPlacementId);
  const unused = puzzle.force_tiles.filter((item) => !placements.some((placement) => placement.tile_id === item.tile_id));

  const savePlan = (next: Placement[]) => { setPlacements(next); void setDraft(puzzle.puzzle_id, next); };
  const place = (tileId: string, point: Point) => {
    if (!planning) return;
    if (placements.some((placement) => placement.tile_id === tileId)) { setMessage("That tile is already on the course. Select it to move it."); return; }
    const placement = makePlacement(tileId, point);
    if (!isLegalPlacement(puzzle, placement)) { setMessage("Keep the entire tile inside the dotted placement area."); return; }
    savePlan([...placements, placement]); setSelectedTileId(null); setSelectedPlacementId(tileId); setMessage("");
  };
  const move = (tileId: string, point: Point) => {
    if (!planning) return;
    const placement = makePlacement(tileId, point);
    if (!isLegalPlacement(puzzle, placement)) { setPlacements([...placements]); setMessage("That tile would cross the placement boundary."); return; }
    savePlan(placements.map((item) => item.tile_id === tileId ? placement : item)); setMessage("");
  };
  const remove = () => {
    if (!planning || !selectedPlacementId) return;
    savePlan(placements.filter((item) => item.tile_id !== selectedPlacementId)); setSelectedPlacementId(null); setMessage("");
  };
  const selectInventory = (tileId: string) => { if (!planning) return; setSelectedTileId(tileId === selectedTileId ? null : tileId); setSelectedPlacementId(null); setMessage("Tap or drag to place."); };
  const abort = () => { simulation.current?.abort(); simulation.current = null; setSnapshot(null); setRunState("planning"); setMessage("Run stopped."); };
  const play = () => {
    if (!planning) return;
    simulation.current?.abort();
    const run = new DemoSimulation(puzzle, [...placements]);
    simulation.current = run; run.setRate(rate); setSnapshot(null); setRunState("running"); setAttempts((value) => value + 1); setMessage("Run in progress.");
    run.start((next) => { if (mounted.current) setSnapshot(next); }, async () => {
      if (!mounted.current) return;
      setRunState("validation-pending"); setMessage("Checking result…");
      const rejected = new URLSearchParams(window.location.search).get("demoReject") === "1";
      const response = await mockGameData.validate(puzzle, placements, rejected);
      if (!mounted.current) return;
      if (response.status === "rejected") { setSnapshot(null); setRunState("planning"); setMessage(response.reason); }
      else { await setResult(response.result); setRunState("solved-locked"); router.push(`/result/${puzzle.puzzle_id}`); }
    });
  };
  const pauseOrResume = () => {
    if (runState === "running") { simulation.current?.pause(); setRunState("paused"); }
    else if (runState === "paused") { simulation.current?.resume(); setRunState("running"); }
  };
  const changeRate = (value: 0.5 | 1 | 2) => { setRate(value); simulation.current?.setRate(value); };
  const nudge = (dx: number, dy: number) => { if (selectedPlacement) { const p = placementPoint(selectedPlacement); move(selectedPlacement.tile_id, { x: p.x + dx, y: p.y + dy }); } };
  useEffect(() => {
    if (!planning || !selectedPlacement) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const amount = event.shiftKey ? 0.25 : 1;
      const directions: Record<string, [number, number]> = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] };
      if (directions[event.key]) { event.preventDefault(); nudge(...directions[event.key]); }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [planning, selectedPlacement, placements]);
  const changeCoord = (axis: "x" | "y", raw: string) => {
    if (!selectedPlacement) return;
    const number = Number(raw);
    if (!Number.isFinite(number)) return;
    move(selectedPlacement.tile_id, { ...placementPoint(selectedPlacement), [axis]: number });
  };
  const displayDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${puzzle.active_date}T12:00:00Z`));
  return <div className="game-page">
    <header className="game-hero">
      <div>
        <div className="daily-meta"><span>{archive ? "Archive puzzle" : "Daily puzzle"}</span><span aria-hidden="true">·</span><time>{displayDate}</time></div>
        <h1>{archive ? puzzle.title : <>Daily challenge <span>#126</span></>}</h1>
        <p>{archive ? prettyDate(puzzle.active_date) : "One course. Your own way to the cup."}</p>
      </div>
      <details className="help-menu">
        <summary><HelpCircle size={16} /> How to play</summary>
        <div><p><strong>1.</strong> Choose a force tile.</p><p><strong>2.</strong> Place it on the course.</p><p><strong>3.</strong> Preview your line.</p><small>This is a scripted frontend preview. The physics engine connects later.</small></div>
      </details>
    </header>

    <div className="game-layout">
      <section className="course-card" aria-label="Puzzle course">
        <div className="course-toolbar">
          <div><span className="course-kicker">{archive ? "Archive course" : "Today's course"}</span><h2>{puzzle.title}</h2></div>
          <div className="course-status"><span className="difficulty-badge">{puzzle.difficulty}</span><small>{statusLabels[runState]}</small></div>
        </div>
        <CourseCanvas puzzle={puzzle} placements={placements} snapshot={snapshot} selectedTileId={selectedTileId} selectedPlacementId={selectedPlacementId} onPlace={place} onMove={move} onSelect={setSelectedPlacementId} canEdit={planning} zoom={1} grid={preferences.grid} coordinates={preferences.coordinates} labels={preferences.labels} />
        <div className="course-bottom">
          <div className="course-legend"><span><i className="legend-ball" /> Ball</span><span><i className="legend-sand" /> Sand</span><span><i className="legend-water" /> Water</span></div>
          <span className="course-progress">{snapshot ? `Step ${snapshot.step} · ${secondsForStep(snapshot.step)}s` : `${placements.length} / ${puzzle.force_tiles.length} tiles placed`}</span>
          <span className="preview-note">Illustrative course preview</span>
        </div>
      </section>

      <aside className="game-sidebar">
        <section className="game-controls" aria-label="Game controls">
          <span className="course-kicker">Your toolkit</span>
          <div className="force-heading"><div><h2>Force tiles</h2><span>{unused.length} left</span></div><p>Choose a tile to preview its strength.</p></div>
          <div className="tile-list">{puzzle.force_tiles.map((tile) => { const placed = placements.some((item) => item.tile_id === tile.tile_id); const strength = tile.magnitude_mn <= 1000 ? "Weak" : tile.magnitude_mn <= 2000 ? "Medium" : "Strong"; return <button key={tile.tile_id} className={`tile-row ${selectedTileId === tile.tile_id ? "active" : ""} ${placed ? "placed" : ""}`} disabled={!planning || placed} draggable={planning && !placed} onDragStart={(event) => event.dataTransfer.setData("text/puttential-tile", tile.tile_id)} onClick={() => selectInventory(tile.tile_id)}><span className="tile-symbol" style={{ background: tile.color }}><ArrowRight size={17} style={{ transform: `rotate(${Math.atan2(tile.direction.y, tile.direction.x)}rad)` }} /></span><span className="tile-info"><strong>{tile.name}</strong><small>{placed ? "Placed" : strength}</small></span><span className="tile-cost">{tile.magnitude_mn / 1000} pt</span></button>; })}</div>

          {selectedPlacement && selectedTile && <div className="precision-card">
            <div className="precision-title"><span><i style={{ background: selectedTile.color }} />{selectedTile.name} position</span><button className="remove-tile" disabled={!planning} onClick={remove}><Trash2 size={13} /> Remove</button></div>
            <div className="precision-controls"><div className="coordinate-fields"><label>X<input aria-label="X position" type="number" step="0.001" value={dequantize(selectedPlacement.x_q)} disabled={!planning} onChange={(event) => changeCoord("x", event.target.value)} /></label><label>Y<input aria-label="Y position" type="number" step="0.001" value={dequantize(selectedPlacement.y_q)} disabled={!planning} onChange={(event) => changeCoord("y", event.target.value)} /></label></div><div className="nudge-buttons"><button disabled={!planning} onClick={() => nudge(-1, 0)} aria-label="Nudge tile left"><ArrowLeft size={14} /></button><button disabled={!planning} onClick={() => nudge(0, -1)} aria-label="Nudge tile up"><ArrowUp size={14} /></button><button disabled={!planning} onClick={() => nudge(0, 1)} aria-label="Nudge tile down"><ArrowDown size={14} /></button><button disabled={!planning} onClick={() => nudge(1, 0)} aria-label="Nudge tile right"><ArrowRight size={14} /></button></div></div>
          </div>}

          <div className="toolkit-meta"><span>Attempts today</span><strong>{attempts}</strong></div>
          <div className="run-controls">{planning ? <button className="play-button" aria-label="Play demo run" onClick={play}><Play size={16} fill="currentColor" /> Play preview <ArrowRight size={16} /></button> : locked ? <Link className="play-button" aria-label="View demo result" href={`/result/${puzzle.puzzle_id}`}>View result <ArrowRight size={16} /></Link> : runState === "validation-pending" ? <button className="play-button" disabled>Checking…</button> : <><div className="run-action-row"><button className="secondary-button" onClick={pauseOrResume}>{runState === "paused" ? <Play size={15} /> : <Pause size={15} />}{runState === "paused" ? "Resume" : "Pause"}</button><button className="secondary-button" onClick={abort}><RotateCcw size={15} /> Abort</button></div><div className="speed-row"><span>Preview speed</span><div>{speeds.map((value) => <button key={value} className={rate === value ? "active" : ""} onClick={() => changeRate(value)}>{value}×</button>)}</div></div></>}</div>
          <div className="layout-tools"><button className="sample-button" aria-label="Load sample layout" disabled={!planning} onClick={() => { savePlan([...puzzle.sample_placements]); setSelectedTileId(null); setSelectedPlacementId(null); setMessage("Sample loaded. Press Play preview."); }}><Check size={14} /> Load sample layout</button><button className="subtle-button" disabled={!planning || placements.length === 0} onClick={() => { savePlan([]); setSelectedPlacementId(null); setMessage("Layout cleared."); }}><RotateCcw size={13} /> Reset preview</button></div>
          {message && <p className="game-message" role="status">{message}</p>}
        </section>

        <section className="daily-tip"><span><Lightbulb size={16} fill="currentColor" /></span><div><strong>Today's tip</strong><p>Sand slows the ball down. Use it to your advantage near the cup.</p></div></section>
      </aside>
    </div>

    <section className="feature-strip" aria-label="Daily challenge features">
      <div><span className="feature-icon green"><CalendarDays size={18} /></span><p><strong>One puzzle each day</strong><small>Come back tomorrow for a new course.</small></p></div>
      <div><span className="feature-icon gold"><Trophy size={18} /></span><p><strong>Find your best solution</strong><small>Use less force to climb the leaderboard.</small></p></div>
      <div><span className="feature-icon coral"><Flame size={18} /></span><p><strong>Keep the streak alive</strong><small>You're on a 14 day run.</small></p></div>
    </section>
  </div>;
}
