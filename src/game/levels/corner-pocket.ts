import { rectangle } from '../geometry/polygon';
import { attractorForce, repulsorForce, uniformForce } from '../objects/forces';
import { arenaWalls, block, lowBounce, regularPolygon, wall } from './builders';
import type { Level } from './types';

/**
 * Knock a wedge through a field of bumpers into the narrow pocket in the top
 * right corner. Walls kill most of its bounce, so it stays once it is in.
 */
export const cornerPocket: Level = {
  id: 'corner-pocket',
  name: 'Corner Pocket',
  gravity: { x: 0, y: 0 },
  dynamicBodies: [{
    id: 'wedge',
    position: { x: -5.5, y: -2.6 },
    angle: 0,
    density: 1,
    material: lowBounce,
    ccd: true,
    pieces: [{ id: 'wedge-piece', localPolygon: regularPolygon(0.45, 3, Math.PI / 2) }],
  }],
  staticBodies: [
    ...arenaWalls(),
    block('bumper-west', { x: -2.2, y: 1.2 }, regularPolygon(0.65, 4)),
    block('bumper-middle', { x: 0.6, y: -1.2 }, regularPolygon(0.65, 4)),
    block('bumper-east', { x: 2.8, y: 1.6 }, regularPolygon(0.65, 4)),
    wall('pocket-floor', 6.05, 2.05, 1.7, 0.3),
    wall('pocket-lip', 5.35, 3.4, 0.3, 0.7),
  ],
  fields: [
    {
      id: 'kick',
      localPolygon: rectangle(2.4, 2.4),
      position: { x: -5.2, y: -2.4 },
      angle: 0,
      force: repulsorForce({ x: -1, y: -1 }, 3),
      enabled: false,
    },
    {
      id: 'pull',
      localPolygon: rectangle(2.2, 2.2),
      position: { x: 0, y: 2.6 },
      angle: 0,
      force: attractorForce({ x: 0, y: 0 }, 6),
      enabled: false,
    },
    {
      id: 'gust',
      localPolygon: rectangle(1.8, 1.8),
      position: { x: 3.5, y: -2.6 },
      angle: 0,
      force: uniformForce({ x: 0, y: 4 }),
      enabled: false,
    },
  ],
  goal: {
    bodyId: 'wedge',
    area: { minX: 5.2, maxX: 6.9, minY: 2.2, maxY: 3.75 },
    holdSeconds: 1,
  },
};
