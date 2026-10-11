'use client';
import { useMemo, useRef, useState } from 'react';
import { CourseCanvas, toCanvas, toWorld, polygonPath } from '../../src/frontend/course-canvas';
import type { View } from '../../src/frontend/course-canvas';
import { levelFrame } from '../../src/frontend/level-frame';
import { decodeLevel, pointInPolygon, polygonBounds, resizeArena } from '../../src/game';
import type { LevelDocument, Vec2 } from '../../src/game';
import {
  edit,
  editablePolygon,
  shapes,
  localBounds,
  hasCircle,
  objectBounds,
  objectContains,
  item,
  move,
  mutableItem,
  objectPolygons,
  place,
  presets,
  scaleObject,
} from '../editor/model';
import type { Selection } from '../editor/model';

type Props = {
  document: LevelDocument;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  piece: number;
  vertices: boolean;
  preset: string | null;
  clearPreset: () => void;
  snap: boolean;
  onCommit: (d: LevelDocument) => void;
  onError: (message: string) => void;
};
type Drag = {
  base: LevelDocument;
  start: Vec2;
  selection: Selection | null;
  type: 'move' | 'vertex' | 'resize' | 'rotate' | 'edge' | 'pan';
  index?: number;
  center?: Vec2;
  cameraCenter?: Vec2;
  pixel?: Vec2;
};
export function EditorCanvas(props: Props) {
  const [preview, setPreview] = useState<LevelDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<Vec2 | null>(null);
  const view = useRef<View | null>(null),
    drag = useRef<Drag | null>(null),
    lastPreview = useRef<LevelDocument | null>(null);
  const display = preview ?? props.document;
  const level = useMemo(() => decodeLevel(display.level), [display]);
  const frame = useRef(levelFrame(level));
  frame.current = levelFrame(level);
  const arena = display.editor.arena.bounds;
  const cameraBounds = props.document.editor.arena.bounds;
  const cameraCenter = center ?? {
    x: (cameraBounds.minX + cameraBounds.maxX) / 2,
    y: (cameraBounds.minY + cameraBounds.maxY) / 2,
  };
  const snapped = (p: Vec2) =>
    props.snap ? { x: Math.round(p.x * 4) / 4, y: Math.round(p.y * 4) / 4 } : p;
  const edgePoints = (doc: LevelDocument) => {
    const b = doc.editor.arena.bounds;
    return [
      { x: b.minX, y: (b.minY + b.maxY) / 2 },
      { x: b.maxX, y: (b.minY + b.maxY) / 2 },
      { x: (b.minX + b.maxX) / 2, y: b.minY },
      { x: (b.minX + b.maxX) / 2, y: b.maxY },
    ];
  };
  function handles(doc: LevelDocument, selection: Selection, v: View) {
    const polygons = objectPolygons(doc, selection),
      b = objectBounds(doc, selection);
    const object = item(doc, selection);
    const origin = object?.position ?? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    return {
      polygons,
      resize: { x: b.maxX, y: b.maxY },
      rotate: { x: origin.x, y: b.maxY + 28 / v.scale },
      origin,
    };
  }
  function overlay(ctx: CanvasRenderingContext2D, v: View) {
    const b = display.editor.arena.bounds;
    ctx.save();
    ctx.lineWidth = 1;
    // World-space grid remains aligned while zooming and panning.
    ctx.strokeStyle = '#23612818';
    const step = Math.max(1, 10 ** Math.floor(Math.log10(50 / v.scale)));
    for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX; x += step) {
      const a = toCanvas(v, { x, y: b.minY }),
        z = toCanvas(v, { x, y: b.maxY });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(z.x, z.y);
      ctx.stroke();
    }
    for (let y = Math.ceil(b.minY / step) * step; y <= b.maxY; y += step) {
      const a = toCanvas(v, { x: b.minX, y }),
        z = toCanvas(v, { x: b.maxX, y });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(z.x, z.y);
      ctx.stroke();
    }
    const tl = toCanvas(v, { x: b.minX, y: b.maxY }),
      br = toCanvas(v, { x: b.maxX, y: b.minY });
    ctx.strokeStyle = '#286c37';
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
    function handle(p: Vec2, color: string, round = false) {
      const c = toCanvas(v, p);
      ctx.fillStyle = color;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (round) ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      else ctx.rect(c.x - 5, c.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
    edgePoints(display).forEach((p) => handle(p, '#235a2f'));
    if (props.selection) {
      const h = handles(display, props.selection, v);
      ctx.strokeStyle = '#d35a35';
      ctx.lineWidth = 2;
      h.polygons.forEach((p) => ctx.stroke(polygonPath(v, p)));
      if (!display.editor.arena.walls.includes(props.selection.id)) {
        handle(h.resize, '#d35a35');
        if (props.selection.kind !== 'goal') handle(h.rotate, '#d35a35', true);
        if (
          props.vertices &&
          props.selection.kind !== 'goal' &&
          item(display, props.selection) &&
          shapes(item(display, props.selection)!)[
            Math.min(props.piece, shapes(item(display, props.selection)!).length - 1)
          ]?.kind !== 'circle'
        )
          (h.polygons[Math.min(props.piece, h.polygons.length - 1)] ?? []).forEach((p) =>
            handle(p, '#365cd2', true),
          );
      }
    }
    ctx.restore();
  }
  function pixel(event: React.PointerEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function start(event: React.PointerEvent<HTMLDivElement>) {
    if (!view.current) return;
    const v = view.current,
      p = pixel(event),
      world = toWorld(v, p);
    if (event.button === 1 || event.altKey) {
      event.preventDefault();
      drag.current = {
        base: props.document,
        start: world,
        selection: null,
        type: 'pan',
        cameraCenter,
        pixel: p,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    if (props.preset) {
      drop(props.preset, world);
      return;
    }
    const near = (point: Vec2) => {
      const pos = toCanvas(v, point);
      return Math.hypot(p.x - pos.x, p.y - pos.y) < 11;
    };
    let chosen: Drag | null = null;
    if (props.selection && !props.document.editor.arena.walls.includes(props.selection.id)) {
      const h = handles(props.document, props.selection, v);
      if (
        props.vertices &&
        props.selection.kind !== 'goal' &&
        item(display, props.selection) &&
        shapes(item(display, props.selection)!)[
          Math.min(props.piece, shapes(item(display, props.selection)!).length - 1)
        ]?.kind !== 'circle'
      ) {
        const i = (h.polygons[Math.min(props.piece, h.polygons.length - 1)] ?? []).findIndex(near);
        if (i >= 0)
          chosen = {
            base: props.document,
            start: world,
            selection: props.selection,
            type: 'vertex',
            index: i,
          };
      }
      if (!chosen && near(h.resize))
        chosen = { base: props.document, start: world, selection: props.selection, type: 'resize' };
      if (!chosen && props.selection.kind !== 'goal' && near(h.rotate))
        chosen = {
          base: props.document,
          start: world,
          selection: props.selection,
          type: 'rotate',
          center: h.origin,
        };
    }
    const edge = edgePoints(props.document).findIndex(near);
    if (!chosen && edge >= 0)
      chosen = { base: props.document, start: world, selection: null, type: 'edge', index: edge };
    if (!chosen) {
      const candidates: Selection[] = [
        ...props.document.level.dynamicBodies.map((o) => ({
          kind: 'dynamicBodies' as const,
          id: o.id,
        })),
        ...props.document.level.staticBodies
          .filter((o) => !props.document.editor.arena.walls.includes(o.id))
          .map((o) => ({ kind: 'staticBodies' as const, id: o.id })),
        ...props.document.level.fields.map((o) => ({ kind: 'fields' as const, id: o.id })),
        { kind: 'goal', id: 'goal' },
      ];
      const selected = candidates.find((s) => objectContains(props.document, s, world)) ?? null;
      props.onSelect(selected);
      if (selected)
        chosen = { base: props.document, start: world, selection: selected, type: 'move' };
    }
    if (chosen) {
      drag.current = chosen;
      lastPreview.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current,
      v = view.current;
    if (!d || !v) return;
    const p = pixel(event),
      world = toWorld(v, p);
    if (d.type === 'pan') {
      setCenter({
        x: d.cameraCenter!.x - (p.x - d.pixel!.x) / v.scale,
        y: d.cameraCenter!.y + (p.y - d.pixel!.y) / v.scale,
      });
      return;
    }
    try {
      let next = d.base;
      if (d.type === 'edge') {
        const b = { ...d.base.editor.arena.bounds };
        const snappedWorld = snapped(world);
        if (d.index === 0) b.minX = snappedWorld.x;
        if (d.index === 1) b.maxX = snappedWorld.x;
        if (d.index === 2) b.minY = snappedWorld.y;
        if (d.index === 3) b.maxY = snappedWorld.y;
        next = resizeArena(d.base, b);
      } else if (d.type === 'move')
        next = move(
          d.base,
          d.selection!,
          snapped({ x: world.x - d.start.x, y: world.y - d.start.y }),
        );
      else if (d.type === 'vertex')
        next = edit(d.base, (draft) => {
          const object = mutableItem(draft, d.selection!);
          const delta = { x: world.x - object.position.x, y: world.y - object.position.y };
          const c = Math.cos(object.angle),
            s = Math.sin(object.angle);
          const local = snapped({ x: delta.x * c + delta.y * s, y: -delta.x * s + delta.y * c });
          const polygon = editablePolygon(
            object,
            'pieces' in object ? Math.min(props.piece, object.pieces.length - 1) : 0,
          );
          polygon[d.index!] = { ...local };
        });
      else if (d.type === 'rotate')
        next = edit(d.base, (draft) => {
          const object = mutableItem(draft, d.selection!);
          const angle =
            object.angle +
            Math.atan2(world.y - d.center!.y, world.x - d.center!.x) -
            Math.atan2(d.start.y - d.center!.y, d.start.x - d.center!.x);
          object.angle = props.snap ? (Math.round(angle / (Math.PI / 12)) * Math.PI) / 12 : angle;
        });
      else if (d.type === 'resize') {
        const object = item(d.base, d.selection!);
        const bounds = object ? localBounds(object) : objectBounds(d.base, d.selection!);
        const c = Math.cos(object?.angle ?? 0),
          s = Math.sin(object?.angle ?? 0),
          dx = world.x - d.start.x,
          dy = world.y - d.start.y;
        const delta = snapped({ x: dx * c + dy * s, y: -dx * s + dy * c });
        next = scaleObject(
          d.base,
          d.selection!,
          bounds.maxX - bounds.minX + 2 * delta.x,
          object && hasCircle(object)
            ? ((bounds.maxY - bounds.minY) * (bounds.maxX - bounds.minX + 2 * delta.x)) /
                (bounds.maxX - bounds.minX)
            : bounds.maxY - bounds.minY + 2 * delta.y,
        );
      }
      lastPreview.current = next;
      setPreview(next);
      props.onError('');
    } catch (cause) {
      props.onError(cause instanceof Error ? cause.message : 'Invalid geometry');
    }
  }
  function finish(cancel = false) {
    if (!cancel && lastPreview.current) props.onCommit(lastPreview.current);
    drag.current = null;
    lastPreview.current = null;
    setPreview(null);
  }
  function drop(id: string, world: Vec2) {
    try {
      const preset = presets.find((p) => p.id === id);
      if (!preset) throw new Error('Unknown preset');
      const result = place(props.document, preset, snapped(world));
      props.onCommit(result.doc);
      props.onSelect(result.selection);
      props.clearPreset();
      props.onError('');
    } catch (cause) {
      props.onError(cause instanceof Error ? cause.message : 'Cannot place object');
    }
  }
  return (
    <div className="canvas-panel">
      <div className="canvas-tools">
        <span>
          {props.preset
            ? 'Click to place · Escape cancels'
            : 'Drag to move · Alt-drag to pan · Wheel to zoom'}
        </span>
        <div className="button-row">
          <button onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))} aria-label="Zoom out">
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(6, z * 1.2))} aria-label="Zoom in">
            +
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setCenter(null);
            }}
          >
            Fit board
          </button>
        </div>
      </div>
      <div
        className="course editor-course"
        tabIndex={0}
        aria-label="Level editing canvas"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            finish(true);
            props.clearPreset();
          }
        }}
        onWheel={(e) =>
          setZoom((z) => Math.max(0.25, Math.min(6, z * Math.exp(-e.deltaY * 0.001))))
        }
      >
        <CourseCanvas
          level={level}
          frameRef={frame}
          draft={{}}
          mode="done"
          trail={[]}
          onMoveField={() => {}}
          camera={{ bounds: props.document.editor.arena.bounds, zoom, center: cameraCenter }}
          showAllFields
          overlay={overlay}
          onView={(v) => {
            view.current = v;
          }}
        />
        <div
          className="canvas-input"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={start}
          onPointerMove={movePointer}
          onPointerUp={() => finish()}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => {
            if (drag.current) finish(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (view.current)
              drop(
                e.dataTransfer.getData('application/puttential-preset'),
                toWorld(view.current, pixel(e)),
              );
          }}
        />
      </div>
      <div className="canvas-caption">
        <span>
          {(arena.maxX - arena.minX).toFixed(2)} × {(arena.maxY - arena.minY).toFixed(2)} world
          units
        </span>
        <span>Green handles: board · Coral: size / rotation · Blue: vertices</span>
      </div>
    </div>
  );
}
