"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { forceDensity, shapePolygon } from "@game";
import type { FieldZoneDefinition, Level, RenderBody, RenderField, RenderPiece, RenderState, Vec2 } from "@game";
import type { Draft, Mode } from "./puzzle";

type Props = Readonly<{
  level: Level;
  frameRef: RefObject<RenderState | null>;
  draft: Draft;
  mode: Mode;
  trail: readonly Vec2[];
  onMoveField: (id: string, position: Vec2) => void;
}>;

type View = Readonly<{ scale: number; originX: number; originY: number; bounds: Bounds }>;
type Bounds = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
type Drag = Readonly<{ id: string; pointerId: number; start: Vec2; fieldStart: Vec2 }>;

const ARROW_SPACING = 0.6;
const ARROW_LENGTH = 0.32;
const VIEW_MARGIN = 0.15;
/** Screen distance between preview dots, independent of how fast the body moves. */
const TRAIL_DOT_SPACING = 14;

function rotate(vector: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

/** World points that span the piece: its vertices, or a circle's bounding corners. */
function pieceExtent(piece: RenderPiece): readonly Vec2[] {
  if (piece.kind === "polygon") return piece.worldPolygon;
  const { center, radius } = piece;
  return [{ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius }];
}

function worldBounds(state: RenderState): Bounds {
  const points = state.staticBodies.flatMap((body) => body.pieces.flatMap(pieceExtent));
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function computeView(state: RenderState, width: number, height: number): View {
  const bounds = worldBounds(state);
  const scale = Math.min(
    width / (bounds.maxX - bounds.minX + 2 * VIEW_MARGIN),
    height / (bounds.maxY - bounds.minY + 2 * VIEW_MARGIN),
  );
  return {
    scale,
    originX: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    originY: height / 2 + ((bounds.minY + bounds.maxY) / 2) * scale,
    bounds,
  };
}

function toCanvas(view: View, point: Vec2): Vec2 {
  return { x: view.originX + point.x * view.scale, y: view.originY - point.y * view.scale };
}

function toWorld(view: View, point: Vec2): Vec2 {
  return { x: (point.x - view.originX) / view.scale, y: (view.originY - point.y) / view.scale };
}

function polygonPath(view: View, polygon: readonly Vec2[]): Path2D {
  const path = new Path2D();
  polygon.forEach((point, index) => {
    const { x, y } = toCanvas(view, point);
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

function piecePath(view: View, piece: RenderPiece): Path2D {
  if (piece.kind === "polygon") return polygonPath(view, piece.worldPolygon);
  const path = new Path2D();
  const center = toCanvas(view, piece.center);
  path.arc(center.x, center.y, piece.radius * view.scale, 0, Math.PI * 2);
  return path;
}

/** A dot off a circle's center, so its spin is visible. */
function spinMarkerPath(view: View, body: RenderBody, piece: Extract<RenderPiece, { kind: "circle" }>): Path2D {
  const offset = rotate({ x: piece.radius * 0.55, y: 0 }, body.angle);
  const center = toCanvas(view, { x: piece.center.x + offset.x, y: piece.center.y + offset.y });
  const path = new Path2D();
  path.arc(center.x, center.y, Math.max(1.5, piece.radius * view.scale * 0.16), 0, Math.PI * 2);
  return path;
}

/** Enabled fields as the player sees them: during setup, at their dragged positions. */
function visibleFields(state: RenderState, draft: Draft, mode: Mode): RenderField[] {
  return state.fields.map((field) => displayedField(field, draft, mode)).filter((field) => field.enabled);
}

function displayedField(field: RenderField, draft: Draft, mode: Mode): RenderField {
  const planned = draft[field.id];
  if (mode !== "setup" || planned === undefined) return field;
  const dx = planned.position.x - field.position.x;
  const dy = planned.position.y - field.position.y;
  return {
    ...field,
    position: planned.position,
    enabled: planned.enabled,
    worldPolygon: field.worldPolygon.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  };
}

function drawArrow(context: CanvasRenderingContext2D, from: Vec2, to: Vec2): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 5;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.moveTo(to.x - head * Math.cos(angle - 0.5), to.y - head * Math.sin(angle - 0.5));
  context.lineTo(to.x, to.y);
  context.lineTo(to.x - head * Math.cos(angle + 0.5), to.y - head * Math.sin(angle + 0.5));
  context.stroke();
}

/**
 * Samples the field's own force law on a grid, so any force kind draws correctly.
 * Returns how many arrows were drawn; forces that only act on moving bodies draw none.
 */
function drawForceArrows(context: CanvasRenderingContext2D, view: View, field: RenderField, definition: FieldZoneDefinition): number {
  let drawn = 0;
  const densityAt = forceDensity(definition.force);
  const polygon = shapePolygon(definition.shape);
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  for (let x = Math.min(...xs) + ARROW_SPACING / 2; x < Math.max(...xs); x += ARROW_SPACING) {
    for (let y = Math.min(...ys) + ARROW_SPACING / 2; y < Math.max(...ys); y += ARROW_SPACING) {
      const force = densityAt({ point: { x, y }, velocity: { x: 0, y: 0 }, density: 1 });
      const magnitude = Math.hypot(force.x, force.y);
      if (magnitude < 1e-9) continue;
      const center = rotate({ x, y }, field.angle);
      const direction = rotate({ x: force.x / magnitude, y: force.y / magnitude }, field.angle);
      const half = ARROW_LENGTH / 2;
      const tail = { x: field.position.x + center.x - direction.x * half, y: field.position.y + center.y - direction.y * half };
      const tip = { x: field.position.x + center.x + direction.x * half, y: field.position.y + center.y + direction.y * half };
      drawArrow(context, toCanvas(view, tail), toCanvas(view, tip));
      drawn += 1;
    }
  }
  return drawn;
}

/** Diagonal hatching for fields with no static force, such as brakes. */
function drawHatch(context: CanvasRenderingContext2D, polygon: readonly Vec2[], view: View): void {
  const points = polygon.map((point) => toCanvas(view, point));
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  context.beginPath();
  for (let offset = minX - (maxY - minY); offset < maxX; offset += 10) {
    context.moveTo(offset, maxY);
    context.lineTo(offset + (maxY - minY), minY);
  }
  context.stroke();
}

function draw(context: CanvasRenderingContext2D, view: View, state: RenderState, props: Props): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  const definitions = new Map(props.level.fields.map((field) => [field.id, field]));

  // Goal: a translucent box that fills as the hold timer runs.
  const { goal } = state;
  const topLeft = toCanvas(view, { x: goal.area.minX, y: goal.area.maxY });
  const bottomRight = toCanvas(view, { x: goal.area.maxX, y: goal.area.minY });
  const goalWidth = bottomRight.x - topLeft.x, goalHeight = bottomRight.y - topLeft.y;
  context.fillStyle = "#ffffff55";
  context.fillRect(topLeft.x, topLeft.y, goalWidth, goalHeight);
  context.fillStyle = "#2e7d3233";
  const progress = goal.completedTick !== null ? 1 : goal.heldTicks / goal.holdTicks;
  context.fillRect(topLeft.x, bottomRight.y - goalHeight * progress, goalWidth, goalHeight * progress);
  context.setLineDash([7, 6]);
  context.strokeStyle = "#2e7d32";
  context.lineWidth = 2;
  context.strokeRect(topLeft.x, topLeft.y, goalWidth, goalHeight);
  context.setLineDash([]);
  const flagX = topLeft.x + goalWidth / 2, flagY = topLeft.y + goalHeight / 2 + 14;
  context.fillStyle = "#39853b";
  context.fillRect(flagX - 1.5, flagY - 34, 3, 34);
  context.fillStyle = "#ff6b6b";
  context.beginPath();
  context.moveTo(flagX + 1.5, flagY - 34);
  context.lineTo(flagX + 22, flagY - 27);
  context.lineTo(flagX + 1.5, flagY - 20);
  context.fill();

  // Fields.
  for (const field of visibleFields(state, props.draft, props.mode)) {
    const definition = definitions.get(field.id);
    const path = polygonPath(view, field.worldPolygon);
    context.save();
    context.fillStyle = "#ffffff80";
    context.fill(path);
    context.clip(path);
    context.strokeStyle = "#2e7d32cc";
    context.lineWidth = 2;
    if (definition !== undefined && drawForceArrows(context, view, field, definition) === 0) {
      drawHatch(context, field.worldPolygon, view);
    }
    context.restore();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.stroke(path);
  }

  // Walls.
  context.fillStyle = "#3f9441";
  context.shadowColor = "#2e7d3255";
  context.shadowOffsetX = 3;
  context.shadowOffsetY = 4;
  for (const body of state.staticBodies) {
    for (const piece of body.pieces) context.fill(piecePath(view, piece));
  }
  context.shadowColor = "transparent";

  // Predicted path for the start of the run.
  if (props.mode === "setup") {
    context.fillStyle = "#1f5f23cc";
    const points = props.trail.map((point) => toCanvas(view, point));
    let untilNextDot = TRAIL_DOT_SPACING;
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1]!, to = points[i]!;
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      let travelled = 0;
      while (length - travelled >= untilNextDot) {
        travelled += untilNextDot;
        untilNextDot = TRAIL_DOT_SPACING;
        const t = travelled / length;
        context.beginPath();
        context.arc(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 3, 0, Math.PI * 2);
        context.fill();
      }
      untilNextDot -= length - travelled;
    }
  }

  // Bodies, shaded across each piece's extent so any shape reads as solid.
  context.save();
  context.shadowColor = "#32863477";
  context.shadowBlur = 10;
  context.shadowOffsetX = 3;
  context.shadowOffsetY = 5;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1.5;
  for (const body of state.bodies) {
    for (const piece of body.pieces) {
      const points = pieceExtent(piece).map((point) => toCanvas(view, point));
      const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
      const gradient = context.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.5, "#f1fcf1");
      gradient.addColorStop(1, "#a9dcaa");
      context.fillStyle = gradient;
      const path = piecePath(view, piece);
      context.fill(path);
      context.stroke(path);
      if (piece.kind === "circle") {
        context.fillStyle = "#7fc681";
        context.fill(spinMarkerPath(view, body, piece));
      }
    }
  }
  context.restore();
}

export function CourseCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  const viewRef = useRef<View | null>(null);
  const dragRef = useRef<Drag | null>(null);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = requestAnimationFrame(function render() {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const state = propsRef.current.frameRef.current;
      if (state !== null && width > 0 && height > 0) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        const view = computeView(state, width / ratio, height / ratio);
        viewRef.current = view;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        draw(context, view, state, propsRef.current);
      }
      frame = requestAnimationFrame(render);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>): Vec2 {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function fieldAt(point: Vec2): RenderField | null {
    const { frameRef, draft, mode } = propsRef.current;
    const state = frameRef.current, view = viewRef.current;
    const context = canvasRef.current?.getContext("2d");
    if (state === null || view === null || !context) return null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    return visibleFields(state, draft, mode).reverse().find((field) =>
      context.isPointInPath(polygonPath(view, field.worldPolygon), point.x, point.y)) ?? null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`course-canvas ${props.mode === "setup" ? "editable" : ""}`}
      aria-label="Puzzle course. Drag force fields to move them before pressing Play."
      onPointerDown={(event) => {
        if (propsRef.current.mode !== "setup" || viewRef.current === null) return;
        const point = pointerPosition(event);
        const field = fieldAt(point);
        if (field === null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { id: field.id, pointerId: event.pointerId, start: toWorld(viewRef.current, point), fieldStart: field.position };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current, view = viewRef.current;
        if (drag === null || view === null || drag.pointerId !== event.pointerId) return;
        const world = toWorld(view, pointerPosition(event));
        const { bounds } = view;
        propsRef.current.onMoveField(drag.id, {
          x: Math.min(bounds.maxX, Math.max(bounds.minX, drag.fieldStart.x + world.x - drag.start.x)),
          y: Math.min(bounds.maxY, Math.max(bounds.minY, drag.fieldStart.y + world.y - drag.start.y)),
        });
      }}
      onPointerUp={() => { dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
    />
  );
}
