import { rectangle } from '../geometry/polygon';
import { uniformForce } from '../objects/forces';
import { arenaWalls, lowBounce, wall } from './builders';
import type { Level } from './types';

/** The solid divider forces a downward turn before the bar can travel right. */
export const exampleBarPuzzle: Level = {
  id: 'bar-around-corner',
  name: 'Bar Around the Corner',
  gravity: { x: 0, y: 0 },
  dynamicBodies: [
    {
      id: 'bar',
      position: { x: -4.8, y: 1.45 },
      angle: 0,
      linearVelocity: { x: 0, y: 0 },
      angularVelocity: 0,
      density: 1,
      material: lowBounce,
      ccd: true,
      pieces: [{ id: 'bar-material', localPolygon: rectangle(2.4, 0.55) }],
    },
  ],
  staticBodies: [
    ...arenaWalls('boundary'),
    wall('turn-divider', 0.65, 0.875, 0.5, 5.75),
    wall('lower-entry-guide', -2.15, -2.65, 1.2, 0.3),
    wall('upper-exit-guide', 2.3, 2.8, 1.6, 0.3),
  ],
  fields: [
    {
      id: 'drop-field',
      localPolygon: [
        { x: -0.78, y: -0.9 },
        { x: 0.78, y: -0.9 },
        { x: 1.15, y: 0.9 },
        { x: -1.15, y: 0.9 },
      ],
      position: { x: -4.8, y: 1.45 },
      angle: 0,
      force: uniformForce({ x: 0, y: -5.5 }),
      enabled: false,
    },
    {
      id: 'push-field',
      localPolygon: rectangle(2.8, 1.8),
      position: { x: -4.45, y: -2.25 },
      angle: 0,
      force: uniformForce({ x: 5.5, y: 0 }),
      enabled: false,
    },
  ],
  goal: {
    bodyId: 'bar',
    area: { minX: 3.45, maxX: 6.35, minY: -3.4, maxY: -1.3 },
    holdSeconds: 1,
  },
};
