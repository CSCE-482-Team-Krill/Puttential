import { rectangle } from '../geometry/polygon';
import { dragForce, uniformForce } from '../objects/forces';
import { arenaWalls, lowBounce, translatePolygon, wall } from './builders';
import type { Level } from './types';

/**
 * An L-shaped key is too wide for the gap in the shelf. Lift one end to turn it
 * upright, then guide it through and settle it above.
 */
export const keyTurn: Level = {
  id: 'key-turn',
  name: 'Key Turn',
  gravity: { x: 0, y: 0 },
  dynamicBodies: [{
    id: 'key',
    position: { x: -3, y: -2.2 },
    angle: 0,
    density: 1,
    material: lowBounce,
    ccd: true,
    pieces: [
      { id: 'key-shaft', localPolygon: rectangle(2.6, 0.35) },
      { id: 'key-bit', localPolygon: translatePolygon(rectangle(0.4, 0.55), 1.1, -0.45) },
    ],
  }],
  staticBodies: [
    ...arenaWalls(),
    wall('left-shelf', -3.95, 0.3, 5.9, 0.3),
    wall('right-shelf', 3.95, 0.3, 5.9, 0.3),
  ],
  fields: [
    {
      id: 'lift',
      localPolygon: rectangle(1.8, 1.8),
      position: { x: -5, y: -2.8 },
      angle: 0,
      force: uniformForce({ x: 0, y: 5 }),
      enabled: false,
    },
    {
      id: 'shove',
      localPolygon: rectangle(1.6, 2.2),
      position: { x: 4.5, y: -2.4 },
      angle: 0,
      force: uniformForce({ x: 4, y: 0 }),
      enabled: false,
    },
    {
      id: 'brake',
      localPolygon: rectangle(2.4, 2.4),
      position: { x: 4.5, y: 2.2 },
      angle: 0,
      force: dragForce(3),
      enabled: false,
    },
  ],
  goal: {
    bodyId: 'key',
    area: { minX: -2, maxX: 2, minY: 1.6, maxY: 3.4 },
    holdSeconds: 1,
  },
};
