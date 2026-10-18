import type { PieceShape } from '../levels/types';
const polygon = (radius: number, sides: number): PieceShape => ({
  kind: 'polygon',
  points: Array.from({ length: sides }, (_, i) => ({
    x: radius * Math.cos((i * 2 * Math.PI) / sides),
    y: radius * Math.sin((i * 2 * Math.PI) / sides),
  })),
});
/** Shape records go unchanged to parseLevel and the Rapier collider builder. */
export const shapePresets: readonly { id: string; label: string; pieces: () => PieceShape[] }[] = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    pieces: () => [{ kind: 'rectangle', width: 1.6, height: 0.6 }],
  },
  { id: 'square', label: 'Square', pieces: () => [{ kind: 'rectangle', width: 1, height: 1 }] },
  { id: 'triangle', label: 'Triangle', pieces: () => [polygon(0.6, 3)] },
  { id: 'hexagon', label: 'Hexagon', pieces: () => [polygon(0.6, 6)] },
  { id: 'ball', label: 'Ball (circle)', pieces: () => [{ kind: 'circle', radius: 0.4 }] },
  {
    id: 'ell',
    label: 'L / compound',
    pieces: () => [
      { kind: 'rectangle', width: 0.4, height: 1.4 },
      {
        kind: 'polygon',
        points: [
          { x: 0.2, y: -0.7 },
          { x: 1.2, y: -0.7 },
          { x: 1.2, y: -0.3 },
          { x: 0.2, y: -0.3 },
        ],
      },
    ],
  },
];

/** Zone defaults use the same editable field shapes as the engine. */
export const zonePresets = {
  water: () => ({ kind: 'rectangle' as const, width: 2, height: 2 }),
  lava: () => ({ kind: 'rectangle' as const, width: 2, height: 2 }),
  portal: () => ({
    kind: 'polygon' as const,
    points: Array.from({ length: 32 }, (_, i) => ({
      x: 0.6 * Math.cos((i * Math.PI) / 16),
      y: 0.9 * Math.sin((i * Math.PI) / 16),
    })),
  }),
};
