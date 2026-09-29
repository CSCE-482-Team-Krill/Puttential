import { rectangle } from '../geometry/polygon';
import type { Level, StaticBodyDefinition } from './types';

const material = { restitution: 0.01 } as const;

function wall(id: string, x: number, y: number, width: number, height: number): StaticBodyDefinition {
  return {
    id,
    position: { x, y },
    angle: 0,
    material,
    pieces: [{ id: `${id}-piece`, localPolygon: rectangle(width, height) }],
  };
}

function puckPolygon(radius: number): { x: number; y: number }[] {
  return Array.from({ length: 12 }, (_, index) => {
    const angle = index * Math.PI / 6;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

/** A repulsor launches the puck over the divider; the attractor catches it. */
export const radialRelayGoal = {
  minX: 3.4,
  maxX: 5.6,
  minY: 1.1,
  maxY: 3.3,
  holdSeconds: 0.5,
} as const;

export const radialRelay: Level = {
  id: 'radial-relay',
  version: 1,
  gravity: { x: 0, y: 0 },
  dynamicBodies: [{
    id: 'puck',
    position: { x: -4, y: -1.6 },
    angle: 0,
    density: 1,
    material,
    ccd: true,
    pieces: [{ id: 'puck-piece', localPolygon: puckPolygon(0.35) }],
  }],
  staticBodies: [
    wall('left-rail', -7.15, 0, 0.5, 8.5),
    wall('right-rail', 7.15, 0, 0.5, 8.5),
    wall('bottom-rail', 0, -4, 14.8, 0.5),
    wall('top-rail', 0, 4, 14.8, 0.5),
    wall('divider', 0.15, -1.25, 0.45, 5.5),
  ],
  fields: [
    {
      id: 'launch',
      kind: 'repulsor',
      localPolygon: [
        { x: -6, y: -3.5 }, { x: -1, y: -3.5 },
        { x: -1, y: 0.8 }, { x: -2.5, y: 0.8 },
        { x: -2.5, y: 3.5 }, { x: -6, y: 3.5 },
      ],
      position: { x: 0, y: 0 },
      angle: 0,
      sourceLocal: { x: -5.4, y: -3 },
      strength: 2,
      enabled: false,
    },
    {
      id: 'catch',
      kind: 'attractor',
      localPolygon: rectangle(7, 2.5),
      position: { x: 2.5, y: 2.25 },
      angle: 0,
      sourceLocal: { x: 2, y: -0.05 },
      strength: 10,
      enabled: false,
    },
  ],
  prediction: { maxTicks: 1800, sampleEveryTicks: 12 },
};
