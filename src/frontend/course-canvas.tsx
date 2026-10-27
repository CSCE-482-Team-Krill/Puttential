'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { drawZone, drawLiquid } from './zone-drawing';
import { portalPairColors } from './portal-colors';
import { directionHint } from './direction-hint';
import {
  isCourseObject,
  polygonBounds,
  shapePolygon,
  forceDensity,
  levelBounds,
  POSITION_QUANTUM,
} from '../game';
import type {
  FieldZoneDefinition,
  Level,
  RenderField,
  RenderState,
  RenderPiece,
  Vec2,
} from '../game';
import { initialGoal } from './goal-progress';
import type { GoalProgress } from './goal-progress';
import type { Draft, Mode } from './puzzle';

export type Props = Readonly<{
  level: Level;
  frameRef: RefObject<RenderState | null>;
  draft: Draft;
  /** When set, drawn instead of `draft`, so scripted animation needs no React updates. */
  draftOverride?: RefObject<Draft | null>;
  mode: Mode;
  trail: readonly Vec2[];
  goalRef?: RefObject<GoalProgress>;
  camera?: { bounds: Bounds; zoom: number; center: Vec2 };
  showAllFields?: boolean;
  onView?: (view: View) => void;
  overlay?: (context: CanvasRenderingContext2D, view: View) => void;
  onMoveField: (id: string, position: Vec2) => void;
  onSelectField?: (id: string) => void;
  selectedField?: string | null;
  placementBounds?: Bounds;
  editingLocked?: boolean;
}>;

export type View = Readonly<{ scale: number; originX: number; originY: number; bounds: Bounds }>;
export type Bounds = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
type Drag = Readonly<{
  id: string;
  pointerId: number;
  start: Vec2;
  fieldStart: Vec2;
  extents: Bounds;
  width: number;
  height: number;
}>;

const ARROW_SPACING = 0.6;
const ARROW_LENGTH = 0.32;
const VIEW_MARGIN = 0.15;

function rotate(vector: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

function computeView(level: Level, width: number, height: number, camera?: Props['camera']): View {
  const bounds = camera?.bounds ?? levelBounds(level);
  const scale =
    (camera?.zoom ?? 1) *
    Math.min(
      width / (bounds.maxX - bounds.minX + 2 * VIEW_MARGIN),
      height / (bounds.maxY - bounds.minY + 2 * VIEW_MARGIN),
    );
  return {
    scale,
    originX: width / 2 - (camera?.center.x ?? (bounds.minX + bounds.maxX) / 2) * scale,
    originY: height / 2 + (camera?.center.y ?? (bounds.minY + bounds.maxY) / 2) * scale,
    bounds,
  };
}

export function toCanvas(view: View, point: Vec2): Vec2 {
  return { x: view.originX + point.x * view.scale, y: view.originY - point.y * view.scale };
}

export function toWorld(view: View, point: Vec2): Vec2 {
  return { x: (point.x - view.originX) / view.scale, y: (view.originY - point.y) / view.scale };
}

export function polygonPath(view: View, polygon: readonly Vec2[]): Path2D {
  const path = new Path2D();
  polygon.forEach((point, index) => {
    const { x, y } = toCanvas(view, point);
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

export function piecePath(view: View, piece: RenderPiece): Path2D {
  if (piece.kind === 'polygon') return polygonPath(view, piece.worldPolygon);
  const center = toCanvas(view, piece.center),
    path = new Path2D();
  path.arc(center.x, center.y, piece.radius * view.scale, 0, 2 * Math.PI);
  return path;
}

/** Enabled fields as the player sees them: during setup, at their dragged positions. */
function visibleFields(state: RenderState, draft: Draft, mode: Mode): RenderField[] {
  return state.fields
    .map((field) => displayedField(field, draft, mode))
    .filter((field) => field.enabled);
}

function displayedField(field: RenderField, draft: Draft, mode: Mode): RenderField {
  if (isCourseObject(field.force)) return field;
  const planned = draft[field.id];
  if (mode !== 'setup' || planned === undefined) return field;
  const deltaAngle = (planned.angle ?? field.angle) - field.angle;
  return {
    ...field,
    position: planned.position,
    angle: planned.angle ?? field.angle,
    enabled: planned.enabled,
    worldPolygon: field.worldPolygon.map((point) => {
      const local = rotate(
        { x: point.x - field.position.x, y: point.y - field.position.y },
        deltaAngle,
      );
      return { x: planned.position.x + local.x, y: planned.position.y + local.y };
    }),
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
function drawForceArrows(
  context: CanvasRenderingContext2D,
  view: View,
  field: RenderField,
  definition: FieldZoneDefinition,
): number {
  let drawn = 0;
  const xs = shapePolygon(definition.shape).map((point) => point.x);
  const ys = shapePolygon(definition.shape).map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  // Expanded courses should not make visual sampling unbounded. Physics sampling is unchanged.
  const spacing = Math.max(ARROW_SPACING, (maxX - minX) / 64, (maxY - minY) / 64);
  for (let column = 0; column < Math.min(64, Math.ceil((maxX - minX) / spacing)); column++) {
    const x = minX + (column + 0.5) * spacing;
    if (x >= maxX) continue;
    for (let row = 0; row < Math.min(64, Math.ceil((maxY - minY) / spacing)); row++) {
      const y = minY + (row + 0.5) * spacing;
      if (y >= maxY) continue;
      const force = forceDensity(definition.force)({
        point: { x, y },
        velocity: { x: 0, y: 0 },
        density: 1,
      });
      const magnitude = Math.hypot(force.x, force.y);
      if (magnitude < 1e-9) continue;
      const center = rotate({ x, y }, field.angle);
      const direction = rotate({ x: force.x / magnitude, y: force.y / magnitude }, field.angle);
      const half = (ARROW_LENGTH / 2) * (spacing / ARROW_SPACING);
      const tail = {
        x: field.position.x + center.x - direction.x * half,
        y: field.position.y + center.y - direction.y * half,
      };
      const tip = {
        x: field.position.x + center.x + direction.x * half,
        y: field.position.y + center.y + direction.y * half,
      };
      drawArrow(context, toCanvas(view, tail), toCanvas(view, tip));
      drawn += 1;
    }
  }
  return drawn;
}

/** Diagonal hatching for fields with no static force, such as brakes. */
function drawHatch(context: CanvasRenderingContext2D, polygon: readonly Vec2[], view: View): void {
  const points = polygon.map((point) => toCanvas(view, point));
  const xs = points.map((point) => point.x),
    ys = points.map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  context.beginPath();
  for (let offset = minX - (maxY - minY); offset < maxX; offset += 10) {
    context.moveTo(offset, maxY);
    context.lineTo(offset + (maxY - minY), minY);
  }
  context.stroke();
}

function draw(
  context: CanvasRenderingContext2D,
  view: View,
  state: RenderState,
  props: Props,
): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  const definitions = new Map(props.level.fields.map((field) => [field.id, field]));

  // Goal: a translucent box that fills as the hold timer runs.
  const goal = props.goalRef?.current ?? initialGoal(props.level.goal);
  const topLeft = toCanvas(view, { x: goal.area.minX, y: goal.area.maxY });
  const bottomRight = toCanvas(view, { x: goal.area.maxX, y: goal.area.minY });
  const goalWidth = bottomRight.x - topLeft.x,
    goalHeight = bottomRight.y - topLeft.y;
  context.fillStyle = '#ffffff55';
  context.fillRect(topLeft.x, topLeft.y, goalWidth, goalHeight);
  context.fillStyle = '#2e7d3233';
  const progress = goal.completedTick !== null ? 1 : goal.heldTicks / Math.max(1, goal.holdTicks);
  context.fillRect(
    topLeft.x,
    bottomRight.y - goalHeight * progress,
    goalWidth,
    goalHeight * progress,
  );
  context.setLineDash([7, 6]);
  context.strokeStyle = '#2e7d32';
  context.lineWidth = 2;
  context.strokeRect(topLeft.x, topLeft.y, goalWidth, goalHeight);
  context.setLineDash([]);
  const flagX = topLeft.x + goalWidth / 2,
    flagY = topLeft.y + goalHeight / 2 + 14;
  context.fillStyle = '#2d3a3a';
  context.fillRect(flagX - 1.5, flagY - 34, 3, 34);
  context.fillStyle = '#ff6b6b';
  context.beginPath();
  context.moveTo(flagX + 1.5, flagY - 34);
  context.lineTo(flagX + 22, flagY - 27);
  context.lineTo(flagX + 1.5, flagY - 20);
  context.fill();

  const animate =
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !document.querySelector('.reduce-motion');
  const time = animate ? performance.now() / 1000 : 0;
  const colors = portalPairColors(props.level.fields);
  const fieldsToDraw = props.showAllFields
    ? state.fields
    : visibleFields(state, props.draft, props.mode);
  // Fields.
  for (const field of fieldsToDraw) {
    const definition = definitions.get(field.id);
    const path = polygonPath(view, field.worldPolygon);
    if (
      drawZone(
        context,
        view,
        field,
        path,
        time,
        field.force.kind === 'portal' ? colors.get(field.force.pairId)! : '#5ba9df',
      )
    )
      continue;
    context.save();
    context.globalAlpha = field.enabled || !props.showAllFields ? 1 : 0.5;
    context.fillStyle = '#ffffff80';
    context.fill(path);
    context.clip(path);
    context.strokeStyle = '#2e7d32cc';
    context.lineWidth = 2;
    if (definition !== undefined && drawForceArrows(context, view, field, definition) === 0) {
      drawHatch(context, field.worldPolygon, view);
    }
    context.restore();
    context.strokeStyle = props.selectedField === field.id ? '#ffcc66' : '#ffffff';
    context.lineWidth = props.selectedField === field.id ? 3 : 2;
    context.stroke(path);
  }

  // Walls.
  context.fillStyle = '#2e7d32';
  for (const body of state.staticBodies) {
    for (const piece of body.pieces) context.fill(piecePath(view, piece));
  }
  context.shadowColor = 'transparent';

  // Start beyond the body's edge so even a slow, wide body cannot hide the hint.
  if (props.mode === 'setup') {
    const body = state.bodies.find((body) => body.id === props.level.goal.bodyId);
    const hint = body && directionHint(body, props.trail, view.scale);
    if (hint) {
      context.save();
      context.fillStyle = '#000000';
      context.strokeStyle = '#000000';
      context.lineWidth = 1.5;
      context.lineCap = 'round';
      for (const dot of hint.dots) {
        const point = toCanvas(view, dot);
        context.beginPath();
        context.arc(point.x, point.y, 3, 0, Math.PI * 2);
        context.fill();
      }
      drawArrow(context, toCanvas(view, hint.arrow.from), toCanvas(view, hint.arrow.to));
      context.restore();
    }
  }

  // Ivory bodies with a charcoal edge remain distinct from turf and force fields.
  context.save();
  context.shadowColor = '#2d3a3a26';
  context.shadowBlur = 3;
  context.shadowOffsetY = 2;
  context.strokeStyle = '#2d3a3a';
  context.fillStyle = '#f8f9f4';
  context.lineWidth = 1.5;
  for (const body of state.bodies) {
    if (body.destroyed) continue;
    context.save();
    if (body.burnt) {
      context.shadowColor = '#00000044';
      context.strokeStyle = '#151515';
      context.fillStyle = '#161616';
    }
    if (body.teleporting) context.globalAlpha = 0.45;
    if (body.submerged) {
      const c = toCanvas(view, body.position);
      context.translate(c.x, c.y + 2);
      context.scale(0.88, 0.88);
      context.translate(-c.x, -c.y);
      context.globalAlpha = body.burnt ? 1 : 0.8;
    }
    for (const piece of body.pieces) {
      const path = piecePath(view, piece);
      context.fill(path);
      context.stroke(path);
      if (piece.kind === 'circle') {
        const center = toCanvas(view, piece.center),
          length = piece.radius * view.scale * 0.7;
        context.save();
        context.shadowColor = 'transparent';
        context.strokeStyle = body.burnt ? '#454545' : '#566768';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(center.x, center.y);
        context.lineTo(
          center.x + Math.cos(body.angle) * length,
          center.y - Math.sin(body.angle) * length,
        );
        context.stroke();
        context.restore();
      }
    }
    context.restore();
  }
  context.restore();
  // Surface tint clips to the liquid outline, leaving the submerged object visible underneath.
  for (const field of fieldsToDraw)
    if (field.enabled && (field.force.kind === 'water' || field.force.kind === 'lava')) {
      drawLiquid(context, view, field, polygonPath(view, field.worldPolygon), time, true);
    }
}

export function CourseCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  const viewRef = useRef<View | null>(null);
  const dragRef = useRef<Drag | null>(null);
  propsRef.current = props;

  /** A changed canvas size invalidates the gesture's original world projection. */
  function endDrag(canvas: HTMLCanvasElement) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && canvas.hasPointerCapture(drag.pointerId)) {
      canvas.releasePointerCapture(drag.pointerId);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let frame = requestAnimationFrame(function render() {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * ratio),
        height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        endDrag(canvas);
        canvas.width = width;
        canvas.height = height;
      }
      const state = propsRef.current.frameRef.current;
      if (state !== null && width > 0 && height > 0) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        const view = computeView(
          propsRef.current.level,
          width / ratio,
          height / ratio,
          propsRef.current.camera,
        );
        viewRef.current = view;
        propsRef.current.onView?.(view);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const props = propsRef.current,
          override = props.draftOverride?.current;
        draw(context, view, state, override ? { ...props, draft: override } : props);
        propsRef.current.overlay?.(context, view);
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
    const state = frameRef.current,
      view = viewRef.current;
    const context = canvasRef.current?.getContext('2d');
    if (state === null || view === null || !context) return null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    return (
      visibleFields(state, draft, mode)
        .filter((field) => !isCourseObject(field.force))
        .reverse()
        .find((field) =>
          context.isPointInPath(polygonPath(view, field.worldPolygon), point.x, point.y),
        ) ?? null
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`course-canvas ${props.mode === 'setup' ? 'editable' : ''}`}
      aria-label="Puzzle course. Drag force fields to move them before pressing Play."
      onPointerDown={(event) => {
        if (
          propsRef.current.editingLocked ||
          propsRef.current.mode !== 'setup' ||
          viewRef.current === null
        )
          return;
        const canvas = event.currentTarget;
        const ratio = window.devicePixelRatio || 1;
        // Wait for a fresh view if a pointer event arrives before the resize frame.
        if (
          canvas.width !== Math.round(canvas.clientWidth * ratio) ||
          canvas.height !== Math.round(canvas.clientHeight * ratio)
        )
          return;
        const point = pointerPosition(event);
        const field = fieldAt(point);
        if (field === null) return;
        propsRef.current.onSelectField?.(field.id);
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          id: field.id,
          pointerId: event.pointerId,
          start: toWorld(viewRef.current, point),
          fieldStart: field.position,
          extents: polygonBounds(
            field.worldPolygon.map((point) => ({
              x: point.x - field.position.x,
              y: point.y - field.position.y,
            })),
          ),
          width: canvas.clientWidth,
          height: canvas.clientHeight,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current,
          view = viewRef.current;
        if (drag === null || view === null || drag.pointerId !== event.pointerId) return;
        // Pointer events can precede the next render, so also cancel here.
        if (
          event.currentTarget.clientWidth !== drag.width ||
          event.currentTarget.clientHeight !== drag.height
        ) {
          endDrag(event.currentTarget);
          return;
        }
        const world = toWorld(view, pointerPosition(event));
        if (propsRef.current.editingLocked || propsRef.current.mode !== 'setup') {
          endDrag(event.currentTarget);
          return;
        }
        const bounds = propsRef.current.placementBounds ?? view.bounds;
        propsRef.current.onMoveField(drag.id, {
          x: Math.min(
            Math.floor((bounds.maxX - drag.extents.maxX) / POSITION_QUANTUM) * POSITION_QUANTUM,
            Math.max(
              Math.ceil((bounds.minX - drag.extents.minX) / POSITION_QUANTUM) * POSITION_QUANTUM,
              drag.fieldStart.x + world.x - drag.start.x,
            ),
          ),
          y: Math.min(
            Math.floor((bounds.maxY - drag.extents.maxY) / POSITION_QUANTUM) * POSITION_QUANTUM,
            Math.max(
              Math.ceil((bounds.minY - drag.extents.minY) / POSITION_QUANTUM) * POSITION_QUANTUM,
              drag.fieldStart.y + world.y - drag.start.y,
            ),
          ),
        });
      }}
      onPointerUp={(event) => endDrag(event.currentTarget)}
      onPointerCancel={(event) => endDrag(event.currentTarget)}
      onLostPointerCapture={(event) => endDrag(event.currentTarget)}
    />
  );
}
