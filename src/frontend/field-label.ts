import { forceCatalog, shapePolygon, forceDensity } from '../game';
import type { FieldZoneDefinition } from '../game';
export function fieldName(id: string): string {
  const words = id.replace(/-field$/, '').split('-');
  return words
    .map((word, index) => (index === 0 ? (word[0] ?? '').toUpperCase() + word.slice(1) : word))
    .join(' ');
}

const KIND_GLYPHS = Object.fromEntries(
  forceCatalog
    .filter((force) => force.kind !== 'uniform')
    .map((force) => [force.kind, force.glyph]),
);

/** A compact glyph for the tile list; directional forces show their direction at the field's center. */
export function fieldGlyph(field: FieldZoneDefinition): string {
  const glyph = KIND_GLYPHS[field.force.kind];
  if (glyph !== undefined) return glyph;
  const xs = shapePolygon(field.shape).map((point) => point.x),
    ys = shapePolygon(field.shape).map((point) => point.y);
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  const force = forceDensity(field.force)({ point: center, velocity: { x: 0, y: 0 }, density: 1 });
  const arrows = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
  const octant = Math.round(
    Math.atan2(force.y, force.x) / (Math.PI / 4) + field.angle / (Math.PI / 4),
  );
  return arrows[((octant % 8) + 8) % 8]!;
}
