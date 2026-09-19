"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CircleHelp, Grid2X2, Info, Move, Pause, Play, RotateCcw, ScanSearch, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { CourseCanvas } from "./course-canvas";
import { useAppStore } from "@/lib/app-store";
import { prettyDate } from "@/lib/fixtures";
import { dequantize, forceCost, isLegalPlacement, makePlacement, placementPoint, secondsForStep } from "@/lib/geometry";
import { DemoSimulation, mockGameData } from "@/lib/mock-services";
import type { Placement, Point, PuzzleDefinition, RunSnapshot, RunState } from "@/lib/types";

export function GameExperience({ puzzle, archive = false }: { puzzle: PuzzleDefinition; archive?: boolean }) {
  const router = useRouter();
  const hydrated = useAppStore((state) => state.hydrated);
  const result = useAppStore((state) => state.results[puzzle.puzzle_id]);
  const savedDraft = useAppStore((state) => state.drafts[puzzle.puzzle_id]);
  const preferences = useAppStore((state) => state.preferences);
  const setPreference = useAppStore((state) => state.setPreference);
  const setDraft = useAppStore((state) => state.setDraft);
  const setResult = useAppStore((state) => state.setResult);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>("planning");
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [rate, setRate] = useState<0.5 | 1 | 2>(1);
  const [zoom, setZoom] = useState(1);
  const [showInspector, setShowInspector] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState("");
  const simulation = useRef<DemoSimulation | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; simulation.current?.abort(); }; }, []);
  useEffect(() => { if (hydrated) { setPlacements(result?.placements ?? savedDraft ?? []); setRunState(result ? "solved-locked" : "planning"); } }, [hydrated, puzzle.puzzle_id]); // Restore only when opening a puzzle.
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
  const selectInventory = (tileId: string) => { if (!planning) return; setSelectedTileId(tileId === selectedTileId ? null : tileId); setSelectedPlacementId(null); setMessage("Tap the course or drag this tile onto it."); };
  const abort = () => { simulation.current?.abort(); simulation.current = null; setSnapshot(null); setRunState("planning"); setMessage("Run aborted. Your layout is ready to edit."); };
  const play = () => {
    if (!planning) return;
    simulation.current?.abort();
    const run = new DemoSimulation(puzzle, [...placements]);
    simulation.current = run; run.setRate(rate); setSnapshot(null); setRunState("running"); setAttempts((value) => value + 1); setMessage("Demo run in progress. You can pause or abort at any time.");
    run.start((next) => { if (mounted.current) setSnapshot(next); }, async () => {
      if (!mounted.current) return;
      setRunState("validation-pending"); setMessage("Checking the sample result locally…");
      const rejected = new URLSearchParams(window.location.search).get("demoReject") === "1";
      const response = await mockGameData.validate(puzzle, placements, rejected);
      if (!mounted.current) return;
      if (response.status === "rejected") { setSnapshot(null); setRunState("planning"); setMessage(response.reason); }
      else { await setResult(response.result); setRunState("solved-locked"); setMessage("Demo result saved on this device."); router.push(`/result/${puzzle.puzzle_id}`); }
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
  return <div className="page-width game-page">
    <div className="game-hero"><div><div className="eyebrow"><span className="eyebrow-dot" /> {archive ? "ARCHIVE PUZZLE" : "TODAY’S DAILY DEMO"} <span className="eyebrow-separator">/</span> {prettyDate(puzzle.active_date)}</div><h1>{puzzle.title}<span className="heading-spark">✳</span></h1><p>{puzzle.subtitle} Place your fields, press play, and find a way home.</p></div><div className="hero-links"><span className="difficulty-badge">{puzzle.difficulty} course</span><Link className="text-link" href={archive ? "/archive" : "/leaderboard"}>{archive ? "Back to archive" : "View leaderboard"} <ArrowRight size={16} /></Link></div></div>
    <div className="demo-notice"><CircleHelp size={18} /><span><strong>Frontend demo.</strong> Runs use scripted animation. Results, ranks, accounts, and publishing are local examples, never official.</span></div>
    <div className="game-layout">
      <section className="course-card" aria-label="Puzzle course"><div className="course-toolbar"><div className="toolbar-title"><span className="live-dot" /> {locked ? "COURSE LOCKED" : runState === "running" ? "RUNNING" : runState === "paused" ? "PAUSED" : runState === "validation-pending" ? "CHECKING RESULT" : "PLANNING MODE"}<span className="toolbar-sub">· {puzzle.puzzle_id}</span></div><div className="toolbar-controls"><button className={preferences.grid ? "toolbar-button selected" : "toolbar-button"} onClick={() => setPreference("grid", !preferences.grid)} aria-label="Toggle reference grid" title="Reference grid"><Grid2X2 size={17} /></button><button className={preferences.coordinates ? "toolbar-button selected" : "toolbar-button"} onClick={() => setPreference("coordinates", !preferences.coordinates)} aria-label="Toggle coordinates" title="Coordinates"><ScanSearch size={17} /></button><button className={showInspector ? "toolbar-button selected" : "toolbar-button"} onClick={() => setShowInspector(!showInspector)} aria-label="Toggle course inspector" title="Course inspector"><Info size={17} /></button><span className="toolbar-divider" /><button className="toolbar-button" onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))} aria-label="Zoom out"><ZoomOut size={17} /></button><span className="zoom-value">{Math.round(zoom * 100)}%</span><button className="toolbar-button" onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.25).toFixed(2))))} aria-label="Zoom in"><ZoomIn size={17} /></button></div></div>
        <CourseCanvas puzzle={puzzle} placements={placements} snapshot={snapshot} selectedTileId={selectedTileId} selectedPlacementId={selectedPlacementId} onPlace={place} onMove={move} onSelect={setSelectedPlacementId} canEdit={planning} zoom={zoom} grid={preferences.grid} coordinates={preferences.coordinates} labels={preferences.labels} />
        {showInspector && <div className="course-inspector"><strong>Course inspector <span>visual guide only</span></strong><div><span><i className="legend-swatch grass" /> Grass · baseline</span><span><i className="legend-swatch sand" /> Sand · slows</span><span><i className="legend-swatch ice" /> Ice · slippery</span><span><i className="legend-swatch mud" /> Mud · heavy drag</span></div><p>Terrain and object parameters will become authoritative when the shared physics engine is connected.</p></div>}
        <div className="course-bottom"><span><Move size={16} /> {planning ? "Drag tiles or select one, then tap the course" : "Layout fixed for this attempt"}</span><span>{snapshot ? `Step ${snapshot.step} · ${secondsForStep(snapshot.step)}s` : `${placements.length} / ${puzzle.force_tiles.length} tiles placed`}</span></div>
      </section>
      <aside className="game-sidebar"><section className="side-card inventory-card"><div className="side-heading"><div><span className="section-kicker">01 / BUILD YOUR ROUTE</span><h2>Force tiles</h2></div><span className="count-pill">{unused.length} left</span></div><p className="side-description">Each tile pushes in one fixed direction. You can overlap anything on the course.</p><div className="tile-list">{puzzle.force_tiles.map((tile) => { const placed = placements.some((item) => item.tile_id === tile.tile_id); return <button key={tile.tile_id} className={`tile-row ${selectedTileId === tile.tile_id ? "active" : ""} ${placed ? "placed" : ""}`} disabled={!planning || placed} draggable={planning && !placed} onDragStart={(event) => event.dataTransfer.setData("text/puttential-tile", tile.tile_id)} onClick={() => selectInventory(tile.tile_id)}><span className="tile-symbol" style={{ background: tile.color }}><ArrowRight size={19} style={{ transform: `rotate(${Math.atan2(tile.direction.y, tile.direction.x)}rad)` }} /></span><span className="tile-info"><strong>{tile.name}</strong><small>{placed ? "On course" : "Tap or drag to place"}</small></span><span className="tile-cost">{tile.magnitude_mn / 1000} N</span></button>; })}</div><button className="sample-button" disabled={!planning} onClick={() => { savePlan([...puzzle.sample_placements]); setSelectedTileId(null); setSelectedPlacementId(null); setMessage("Sample layout loaded. Press Play to watch a scripted success."); }}><Check size={16} /> Load sample layout</button><button className="subtle-button full" disabled={!planning || placements.length === 0} onClick={() => { savePlan([]); setSelectedPlacementId(null); setMessage("Layout cleared. Start with a fresh idea."); }}><Trash2 size={15} /> Clear layout</button></section>
        <section className="side-card precision-card"><div className="side-heading"><div><span className="section-kicker">02 / FINE TUNE</span><h2>Placement</h2></div></div>{selectedPlacement && selectedTile ? <><p className="side-description"><strong>{selectedTile.name}</strong> · fixed direction · {selectedTile.magnitude_mn / 1000} N</p><div className="coordinate-fields"><label>X position<input aria-label="X position" type="number" step="0.001" value={dequantize(selectedPlacement.x_q)} disabled={!planning} onChange={(event) => changeCoord("x", event.target.value)} /></label><label>Y position<input aria-label="Y position" type="number" step="0.001" value={dequantize(selectedPlacement.y_q)} disabled={!planning} onChange={(event) => changeCoord("y", event.target.value)} /></label></div><div className="nudge-row"><span>Arrow keys · Shift = ¼ unit</span><div className="nudge-buttons"><button disabled={!planning} onClick={() => nudge(-1, 0)} aria-label="Nudge tile left"><ArrowLeft size={16} /></button><button disabled={!planning} onClick={() => nudge(0, -1)} aria-label="Nudge tile up"><ArrowUp size={16} /></button><button disabled={!planning} onClick={() => nudge(0, 1)} aria-label="Nudge tile down"><ArrowDown size={16} /></button><button disabled={!planning} onClick={() => nudge(1, 0)} aria-label="Nudge tile right"><ArrowRight size={16} /></button></div></div><button className="subtle-button danger" disabled={!planning} onClick={remove}><Trash2 size={16} /> Remove tile</button></> : <p className="empty-selection">Select a placed tile to edit its position with the keyboard or these controls.</p>}</section>
        <section className="side-card run-card"><div className="side-heading"><div><span className="section-kicker">03 / TEST YOUR IDEA</span><h2>Ready to roll?</h2></div></div><div className="metric-strip"><div><small>TOTAL FORCE</small><strong>{(forceCost(puzzle, placements) / 1000).toFixed(0)} <em>N</em></strong></div><div><small>TILES</small><strong>{placements.length} <em>/ {puzzle.force_tiles.length}</em></strong></div><div><small>ATTEMPTS</small><strong>{attempts}</strong></div></div><p className="rank-note">Less force wins. Then fewer tiles. Then faster travel time.</p>{planning ? <button className="play-button" onClick={play}><Play size={20} fill="currentColor" /> Play demo run <ArrowRight size={18} /></button> : locked ? <Link className="play-button" href={`/result/${puzzle.puzzle_id}`}>View demo result <ArrowRight size={18} /></Link> : runState === "validation-pending" ? <button className="play-button" disabled>Checking sample result…</button> : <><div className="run-actions"><button className="secondary-button" onClick={pauseOrResume}>{runState === "paused" ? <Play size={17} /> : <Pause size={17} />}{runState === "paused" ? "Resume" : "Pause"}</button><button className="secondary-button" onClick={abort}><RotateCcw size={17} /> Abort</button></div><div className="speed-row"><span>Viewing speed</span><div>{([0.5, 1, 2] as const).map((value) => <button key={value} className={rate === value ? "active" : ""} onClick={() => changeRate(value)}>{value}×</button>)}</div></div></>}{message && <p className="game-message" role="status">{message}</p>}</section>
      </aside>
    </div><div className="under-game"><div><span className="section-kicker">HOW IT WORKS</span><h2>A tiny nudge. A big idea.</h2><p>Place force fields where the ball may pass. When you press Play, your layout stays fixed for that attempt. Pause to look closer or abort to try a different setup. This frontend demo uses a scripted sample path until the shared physics engine is connected.</p></div><div className="tip-card"><span>✦</span><strong>Course tip</strong><p>You don’t need to use every tile. Unused tiles add no force cost.</p></div></div>
  </div>;
}
