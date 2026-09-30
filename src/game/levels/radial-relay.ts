import { rectangle } from '../geometry/polygon';
import { attractorForce, repulsorForce } from '../objects/forces';
import { arenaWalls, lowBounce, regularPolygon, wall } from './builders';
import type { Level } from './types';

/**
 * A repulsor launches the puck over the divider, and an attractor must catch it
 * and hold it in a goal away from the walls. Neither field solves it alone.
 */
export const radialRelay: Level = {
  id: 'radial-relay',
  name: 'Radial Relay',
  gravity: { x: 0, y: 0 },
  dynamicBodies: [{
    id: 'puck',
    position: { x: -4, y: -1.6 },
    angle: 0,
    density: 1,
    material: lowBounce,
    ccd: true,
    pieces: [{ id: 'puck-piece', localPolygon: regularPolygon(0.35, 12) }],
  }],
  staticBodies: [
    ...arenaWalls(),
    wall('divider', 0.15, -1.25, 0.45, 5.5),
  ],
  fields: [
    {
      id: 'launch',
      localPolygon: [
        { x: -6, y: -3.5 }, { x: -1, y: -3.5 },
        { x: -1, y: 0.8 }, { x: -2.5, y: 0.8 },
        { x: -2.5, y: 3.5 }, { x: -6, y: 3.5 },
      ],
      position: { x: 0, y: 0 },
      angle: 0,
      force: repulsorForce({ x: -5.4, y: -3 }, 2),
      enabled: false,
    },
    {
      id: 'catch',
      localPolygon: rectangle(2.6, 2.6),
      position: { x: 2.5, y: 2.5 },
      angle: 0,
      force: attractorForce({ x: 0, y: 0 }, 10),
      enabled: false,
    },
  ],
  goal: {
    bodyId: 'puck',
    area: { minX: 3.2, maxX: 4.8, minY: -2.2, maxY: -0.6 },
    holdSeconds: 1,
  },
};
