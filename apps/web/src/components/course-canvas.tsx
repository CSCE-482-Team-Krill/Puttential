"use client";

import { useEffect, useRef, useState } from "react";
import { isLegalPlacement, makePlacement, placementPoint } from "@/lib/geometry";
import type { Placement, Point, PuzzleDefinition, RunSnapshot } from "@/lib/types";
import type * as PIXI from "pixi.js";

type Props = {
  puzzle: PuzzleDefinition;
  placements: Placement[];
  snapshot?: RunSnapshot | null;
  selectedTileId?: string | null;
  selectedPlacementId?: string | null;
  onPlace?: (tileId: string, point: Point) => void;
  onMove?: (tileId: string, point: Point) => void;
  onSelect?: (tileId: string | null) => void;
  onCourseClick?: (point: Point) => void;
  canEdit?: boolean;
  zoom?: number;
  grid?: boolean;
  coordinates?: boolean;
  labels?: boolean;
};

type PixiModule = typeof import("pixi.js");
type Ready = { app: PIXI.Application; world: PIXI.Container; pixi: PixiModule };
const flat = (points: Point[]) => points.flatMap((p) => [p.x, p.y]);
const terrainColors: Record<string, number> = { grass: 0x79bd88, sand: 0xe9cc83, ice: 0x9cdeec, gravel: 0xb8b7a1, mud: 0x937351, water: 0x64b9d5 };

export function CourseCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [canvasError, setCanvasError] = useState(false);
  const latest = useRef(props);
  const ballGraphic = useRef<PIXI.Graphics | null>(null);
  const trailGraphic = useRef<PIXI.Graphics | null>(null);
  const startLabel = useRef<PIXI.Text | null>(null);
  latest.current = props;

  useEffect(() => {
    let cancelled = false;
    let app: PIXI.Application | undefined;
    (async () => {
      try {
        const pixi = await import("pixi.js");
        app = new pixi.Application();
        await app.init({ width: 1000, height: 600, backgroundAlpha: 0, antialias: true, preference: "webgl", resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
        if (cancelled) { app.destroy(true); return; }
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.display = "block";
        host.current?.appendChild(app.canvas);
        const world = new pixi.Container();
        app.stage.addChild(world);
        setReady({ app, world, pixi });
      } catch { if (!cancelled) setCanvasError(true); }
    })();
    return () => { cancelled = true; if (app) { try { app.destroy(true); } catch { /* Initializing canvas was already removed. */ } } };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const { app, world, pixi } = ready;
    world.removeChildren().forEach((child) => child.destroy({ children: true }));
    const { puzzle, placements, selectedPlacementId, zoom = 1, grid = false, coordinates = false, labels = true, canEdit = false } = props;
    world.pivot.set(500, 300);
    world.position.set(500, 300);
    world.scale.set(zoom);

    const backdrop = new pixi.Graphics().roundRect(8, 8, 984, 584, 46).fill(0x426958).roundRect(24, 24, 952, 552, 36).fill(0xd9b486).roundRect(32, 32, 936, 536, 30).fill(0x79bd88);
    world.addChild(backdrop);
    for (const region of puzzle.terrain) {
      if (region.kind === "grass") continue;
      const shape = new pixi.Graphics().poly(flat(region.polygon)).fill(terrainColors[region.kind] ?? 0x79bd88).poly(flat(region.polygon)).stroke({ color: 0xffffff, alpha: 0.25, width: 3 });
      world.addChild(shape);
      const minX = Math.min(...region.polygon.map((p) => p.x));
      const maxX = Math.max(...region.polygon.map((p) => p.x));
      const minY = Math.min(...region.polygon.map((p) => p.y));
      const maxY = Math.max(...region.polygon.map((p) => p.y));
      if (region.kind === "sand" || region.kind === "mud") {
        const dots = new pixi.Graphics();
        for (let x = minX + 15; x < maxX; x += 24) for (let y = minY + 14; y < maxY; y += 24) {
          if (x > minX + 8 && x < maxX - 8) dots.circle(x, y, 1.5).fill({ color: region.kind === "sand" ? 0x9e7d41 : 0x563d2e, alpha: 0.35 });
        }
        world.addChild(dots);
      }
      if (region.kind === "ice") {
        const lines = new pixi.Graphics();
        for (let x = minX + 20; x < maxX; x += 38) lines.moveTo(x, minY + 18).lineTo(x + 28, maxY - 18).stroke({ color: 0xffffff, alpha: 0.24, width: 3 });
        world.addChild(lines);
      }
    }
    if (grid) {
      const g = new pixi.Graphics();
      for (let x = 50; x < 950; x += 50) g.moveTo(x, 40).lineTo(x, 560).stroke({ color: 0xffffff, alpha: 0.16, width: 1 });
      for (let y = 50; y < 550; y += 50) g.moveTo(40, y).lineTo(960, y).stroke({ color: 0xffffff, alpha: 0.16, width: 1 });
      world.addChild(g);
    }
    for (const object of puzzle.objects) {
      const g = new pixi.Graphics();
      if (object.kind === "wall") g.roundRect(-object.width / 2, -object.height / 2, object.width, object.height, 8).fill(0xe9e6cc).roundRect(-object.width / 2, -object.height / 2, object.width, object.height, 8).stroke({ color: 0x648172, width: 5 });
      else if (object.kind === "bumper") g.circle(0, 0, object.width / 2).fill(0xf9aa84).circle(0, 0, object.width / 2 - 7).stroke({ color: 0xffefd8, width: 5 });
      else g.roundRect(-object.width / 2, -object.height / 2, object.width, object.height, 12).fill(0x536b8e).roundRect(-object.width / 2 + 6, -object.height / 2 + 6, object.width - 12, object.height - 12, 8).stroke({ color: 0xd5edff, width: 3 });
      g.position.set(object.x, object.y); g.rotation = object.rotation ?? 0; world.addChild(g);
      if (labels && object.kind === "fan") { const t = new pixi.Text({ text: "FAN", style: { fill: 0xffffff, fontSize: 14, fontWeight: "bold", fontFamily: "Arial" } }); t.anchor.set(0.5); t.position.set(object.x, object.y); world.addChild(t); }
    }

    const hole = new pixi.Graphics().circle(puzzle.goal.x, puzzle.goal.y + 6, puzzle.goal.radius + 11).fill({ color: 0x1d4339, alpha: 0.25 }).circle(puzzle.goal.x, puzzle.goal.y, puzzle.goal.radius + 7).fill(0xe9f3d7).circle(puzzle.goal.x, puzzle.goal.y, puzzle.goal.radius).fill(0x183e35).circle(puzzle.goal.x - 5, puzzle.goal.y - 7, 6).fill({ color: 0x5e8170, alpha: 0.55 });
    world.addChild(hole);
    if (labels) { const t = new pixi.Text({ text: "HOLE", style: { fill: 0xffffff, fontSize: 13, fontWeight: "bold", fontFamily: "Arial" } }); t.anchor.set(0.5); t.position.set(puzzle.goal.x, puzzle.goal.y - 50); world.addChild(t); }

    for (const placement of placements) {
      const tile = puzzle.force_tiles.find((item) => item.tile_id === placement.tile_id);
      if (!tile) continue;
      const point = placementPoint(placement);
      const container = new pixi.Container();
      container.position.set(point.x, point.y);
      const isSelected = selectedPlacementId === tile.tile_id;
      const shape = new pixi.Graphics().poly(flat(tile.shape)).fill({ color: tile.color, alpha: 0.68 }).poly(flat(tile.shape)).stroke({ color: isSelected ? 0xffffff : 0x23493f, width: isSelected ? 5 : 3, alpha: 0.9 });
      shape.eventMode = canEdit ? "static" : "none";
      shape.cursor = canEdit ? "grab" : "default";
      container.addChild(shape);
      const angle = Math.atan2(tile.direction.y, tile.direction.x);
      const arrow = new pixi.Graphics().moveTo(-20, 0).lineTo(14, 0).stroke({ color: 0x173f35, width: 5 }).poly([14, -9, 29, 0, 14, 9]).fill(0x173f35);
      arrow.rotation = angle; container.addChild(arrow);
      if (labels) { const t = new pixi.Text({ text: `${tile.magnitude_mn / 1000}N`, style: { fill: 0x173f35, fontSize: 15, fontWeight: "bold", fontFamily: "Arial" } }); t.anchor.set(0.5); t.position.set(0, 43); container.addChild(t); }
      world.addChild(container);
      if (canEdit) shape.on("pointerdown", (event) => {
        event.stopPropagation();
        const local = world.toLocal(event.global);
        drag.current = { tileId: tile.tile_id, container, offset: { x: local.x - container.x, y: local.y - container.y } };
      });
    }
    const trail = new pixi.Graphics(); world.addChild(trail); trailGraphic.current = trail;
    const ball = new pixi.Graphics().circle(4, 7, puzzle.ball.radius + 3).fill({ color: 0x25483d, alpha: 0.22 }).circle(0, 0, puzzle.ball.radius).fill(0xffffff).circle(-5, -6, 5).fill({ color: 0xf2f5ed, alpha: 0.8 });
    ball.position.set(puzzle.ball.x, puzzle.ball.y); world.addChild(ball); ballGraphic.current = ball;
    startLabel.current = null;
    if (labels) { const t = new pixi.Text({ text: "START", style: { fill: 0xffffff, fontSize: 13, fontWeight: "bold", fontFamily: "Arial" } }); t.anchor.set(0.5); t.position.set(puzzle.ball.x, puzzle.ball.y - 43); world.addChild(t); startLabel.current = t; }
    if (coordinates) { const t = new pixi.Text({ text: "0,0                                                      WORLD UNITS", style: { fill: 0xffffff, fontSize: 12, fontFamily: "Arial" } }); t.position.set(48, 544); world.addChild(t); }

    app.stage.eventMode = "static";
    app.stage.hitArea = new pixi.Rectangle(0, 0, 1000, 600);
    const pointerDown = (event: PIXI.FederatedPointerEvent) => {
      const p = latest.current;
      const local = world.toLocal(event.global);
      if (p.onCourseClick) { p.onCourseClick({ x: local.x, y: local.y }); return; }
      if (!p.canEdit) return;
      if (p.selectedTileId) p.onPlace?.(p.selectedTileId, { x: local.x, y: local.y });
      else p.onSelect?.(null);
    };
    const pointerMove = (event: PIXI.FederatedPointerEvent) => {
      if (!drag.current) return;
      const local = world.toLocal(event.global);
      const x = local.x - drag.current.offset.x, y = local.y - drag.current.offset.y;
      drag.current.container.position.set(x, y);
      drag.current.container.alpha = isLegalPlacement(latest.current.puzzle, makePlacement(drag.current.tileId, { x, y })) ? 1 : 0.42;
    };
    const pointerUp = () => {
      const active = drag.current;
      if (!active) return;
      drag.current = null;
      latest.current.onMove?.(active.tileId, { x: active.container.x, y: active.container.y });
      latest.current.onSelect?.(active.tileId);
    };
    app.stage.on("pointerdown", pointerDown);
    app.stage.on("pointermove", pointerMove);
    app.stage.on("pointerup", pointerUp);
    app.stage.on("pointerupoutside", pointerUp);
    return () => {
      app.stage?.off("pointerdown", pointerDown); app.stage?.off("pointermove", pointerMove); app.stage?.off("pointerup", pointerUp); app.stage?.off("pointerupoutside", pointerUp);
    };
  }, [ready, props.puzzle, props.placements, props.selectedPlacementId, props.zoom, props.grid, props.coordinates, props.labels, props.canEdit]);

  useEffect(() => {
    if (!ready || !ballGraphic.current || !trailGraphic.current) return;
    const point = props.snapshot?.ball ?? props.puzzle.ball;
    ballGraphic.current.position.set(point.x, point.y);
    trailGraphic.current.clear();
    props.snapshot?.trail.forEach((p, i) => trailGraphic.current?.circle(p.x, p.y, 3 + i * 0.2).fill({ color: 0xffffff, alpha: 0.08 + i * 0.035 }));
    if (startLabel.current) startLabel.current.visible = !props.snapshot;
  }, [ready, props.snapshot, props.puzzle, props.placements, props.labels]);

  const drag = useRef<{ tileId: string; container: PIXI.Container; offset: Point } | null>(null);
  const dropTile = (event: React.DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/puttential-tile");
    if (!id) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width * 1000 - 500) / (props.zoom ?? 1) + 500;
    const y = ((event.clientY - bounds.top) / bounds.height * 600 - 300) / (props.zoom ?? 1) + 300;
    props.onPlace?.(id, { x, y });
  };
  return <div className="course-canvas" ref={host} role="img" aria-label={`${props.puzzle.title} course. Use the inventory and position controls to place force tiles.`} onDragOver={(event) => event.preventDefault()} onDrop={dropTile}>
    {canvasError ? <div className="canvas-loading canvas-error"><div><strong>Course graphics are unavailable in this browser.</strong><p>Try a browser with WebGL support. You can still inspect the puzzle and load the sample layout.</p>{props.selectedTileId && props.onPlace && <button onClick={() => props.onPlace?.(props.selectedTileId!, { x: 500, y: 300 })}>Place selected tile at center</button>}</div></div> : !ready && <div className="canvas-loading">Drawing course…</div>}
  </div>;
}
