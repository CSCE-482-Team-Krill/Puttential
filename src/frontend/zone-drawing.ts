import type { RenderField } from '../game';
import { polygonBounds } from '../game';
import type { View } from './course-canvas';
import waterTexture from './textures/water-tile.png';
import lavaTexture from './textures/lava-tile.png';

type Liquid = 'water' | 'lava';
const atlases = new Map<Liquid, HTMLCanvasElement>();
const images = new Map<Liquid, HTMLImageElement>();
const patterns = new WeakMap<CanvasRenderingContext2D, Map<Liquid, CanvasPattern>>();

/** Mirror the edited source at every edge for an exactly continuous repeating tile. */
function liquidPattern(ctx: CanvasRenderingContext2D, kind: Liquid): CanvasPattern | undefined {
  const cached = patterns.get(ctx)?.get(kind);
  if (cached) return cached;
  let atlas = atlases.get(kind);
  if (!atlas) {
    let source = images.get(kind);
    if (!source) {
      source = new Image();
      source.src = (kind === 'water' ? waterTexture : lavaTexture).src;
      images.set(kind, source);
    }
    if (!source.complete || !source.naturalWidth) return;
    const size = 128;
    atlas = document.createElement('canvas');
    atlas.width = size * 2;
    atlas.height = size * 2;
    const tile = atlas.getContext('2d')!;
    for (const flipX of [false, true])
      for (const flipY of [false, true]) {
        tile.save();
        tile.translate(flipX ? size * 2 : 0, flipY ? size * 2 : 0);
        tile.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        tile.drawImage(source, 0, 0, size, size);
        tile.restore();
      }
    atlases.set(kind, atlas);
  }
  const pattern = ctx.createPattern(atlas, 'repeat');
  if (!pattern) return;
  const map = patterns.get(ctx) ?? new Map<Liquid, CanvasPattern>();
  map.set(kind, pattern);
  patterns.set(ctx, map);
  return pattern;
}

/** This same surface pass runs under bodies and lightly over them for submersion. */
export function drawLiquid(
  ctx: CanvasRenderingContext2D,
  view: View,
  field: RenderField,
  path: Path2D,
  time: number,
  overlay = false,
): void {
  const kind = field.force.kind;
  if (kind !== 'water' && kind !== 'lava') return;
  const pattern = liquidPattern(ctx, kind);
  // World anchoring keeps the texture density constant when resizing objects or zooming.
  const scale = view.scale / 80;
  pattern?.setTransform(
    new DOMMatrix([
      scale,
      0,
      0,
      scale,
      view.originX + Math.sin(time * 0.24) * 2,
      view.originY + Math.cos(time * 0.18) * 2,
    ]),
  );
  ctx.save();
  ctx.globalAlpha =
    (field.enabled ? 1 : 0.4) *
    (overlay ? (kind === 'water' ? 0.23 : 0.16) : kind === 'water' ? 0.62 : 0.84);
  ctx.fillStyle = pattern ?? (kind === 'water' ? '#368ee6' : '#ff791e');
  ctx.fill(path);
  ctx.restore();
  if (!overlay) {
    ctx.save();
    ctx.strokeStyle = kind === 'water' ? '#5ba9df' : '#ed784c';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = field.enabled ? 1 : 0.4;
    ctx.stroke(path);
    ctx.restore();
  }
}

/** Small canvas accents in the same softly shaded style as the course. */
export function drawZone(
  ctx: CanvasRenderingContext2D,
  view: View,
  field: RenderField,
  path: Path2D,
  time: number,
  color: string,
): boolean {
  const kind = field.force.kind;
  if (kind === 'water' || kind === 'lava') {
    drawLiquid(ctx, view, field, path, time);
    return true;
  }
  if (kind !== 'portal') return false;
  const b = polygonBounds(field.worldPolygon);
  const width = (b.maxX - b.minX) * view.scale,
    height = (b.maxY - b.minY) * view.scale;
  const center = {
    x: view.originX + field.position.x * view.scale,
    y: view.originY - field.position.y * view.scale,
  };
  ctx.save();
  ctx.globalAlpha = field.enabled ? 1 : 0.45;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.lineWidth = 3;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.clip(path);
  ctx.globalAlpha *= 0.15;
  ctx.fill(path);
  ctx.globalAlpha = field.enabled ? 0.8 : 0.35;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = time * 0.7 + (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(
      center.x + Math.cos(a) * width * 0.24,
      center.y + Math.sin(a) * height * 0.24,
      1.8,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.restore();
  return true;
}
