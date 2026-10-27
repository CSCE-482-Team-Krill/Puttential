import type { RenderBody, Vec2 } from '../game';

/** A fixed-size cue outside the body, showing initial direction without revealing its route. */
export function directionHint(body: RenderBody, trail: readonly Vec2[], scale: number) {
  const next = trail.find(
    (point) => Math.hypot(point.x - body.position.x, point.y - body.position.y) > 1e-5,
  );
  if (!next || scale <= 0) return null;
  const dx = next.x - body.position.x;
  const dy = next.y - body.position.y;
  const length = Math.hypot(dx, dy);
  const direction = { x: dx / length, y: dy / length };
  const projection = (point: Vec2) =>
    (point.x - body.position.x) * direction.x + (point.y - body.position.y) * direction.y;
  // The support plane also handles rotated polygons and bodies made of multiple pieces.
  const extent = Math.max(
    0,
    ...body.pieces.flatMap((piece) =>
      piece.kind === 'circle'
        ? [projection(piece.center) + piece.radius]
        : piece.worldPolygon.map(projection),
    ),
  );
  const pointAt = (pixels: number): Vec2 => ({
    x: body.position.x + direction.x * (extent + pixels / scale),
    y: body.position.y + direction.y * (extent + pixels / scale),
  });
  return {
    dots: [pointAt(10), pointAt(20), pointAt(30)],
    arrow: { from: pointAt(38), to: pointAt(46) },
  };
}
