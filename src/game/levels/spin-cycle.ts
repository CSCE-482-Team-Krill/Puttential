import { rectangle } from '../geometry/polygon';
import { dragForce, uniformForce, vortexForce } from '../objects/forces';
import { arenaWalls, block, lowBounce, regularPolygon } from './builders';
import type { Level } from './types';

/**
 * A diamond pillar blocks the straight line to the goal. Swirl or push the
 * puck around it, then brake it in the open goal on the far side.
 */
export const spinCycle: Level = {
  id: 'spin-cycle',
  name: 'Spin Cycle',
  gravity: { x: 0, y: 0 },
  dynamicBodies: [{
    id: 'puck',
    position: { x: -5, y: 0 },
    angle: 0,
    density: 1,
    material: lowBounce,
    ccd: true,
    pieces: [{ id: 'puck-piece', localPolygon: regularPolygon(0.35, 12) }],
  }],
  staticBodies: [
    ...arenaWalls(),
    block('pillar', { x: 0, y: 0 }, regularPolygon(1.7, 4)),
  ],
  fields: [
    {
      id: 'whirl',
      localPolygon: rectangle(5.5, 5.5),
      position: { x: 0, y: 0 },
      angle: 0,
      force: vortexForce({ x: 0, y: 0 }, 3),
      enabled: false,
    },
    {
      id: 'breeze',
      localPolygon: rectangle(2.4, 1.6),
      position: { x: -4.5, y: 2.6 },
      angle: 0,
      force: uniformForce({ x: 3, y: 0 }),
      enabled: false,
    },
    {
      id: 'brake',
      localPolygon: rectangle(2, 2),
      position: { x: -4.5, y: -2.6 },
      angle: 0,
      force: dragForce(4),
      enabled: false,
    },
  ],
  goal: {
    bodyId: 'puck',
    area: { minX: 4.2, maxX: 5.8, minY: -0.8, maxY: 0.8 },
    holdSeconds: 1,
  },
};
