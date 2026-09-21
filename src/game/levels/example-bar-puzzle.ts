import { rectangle } from '../geometry/polygon';
import type { Level, StaticBodyDefinition } from './types';

const railMaterial = { restitution: 0.05 } as const;

function rail(id: string, x: number, y: number, width: number, height: number): StaticBodyDefinition {
  return {
    id,
    position: { x, y },
    angle: 0,
    material: railMaterial,
    pieces: [{ id: `${id}-piece`, localPolygon: rectangle(width, height) }],
  };
}

/**
 * A vertical bar starts left of a narrow gate. Moving the field over one end
 * gives the bar both rightward motion and the torque needed to turn through it.
 * World coordinates use +Y as up.
 */
export const exampleBarPuzzle: Level = {
  id: 'bar-through-gate',
  version: 1,
  gravity: { x: 0, y: 0 },
  dynamicBodies: [
    {
      id: 'bar',
      position: { x: -3.35, y: 0 },
      angle: Math.PI / 2,
      linearVelocity: { x: 0, y: 0 },
      angularVelocity: 0,
      density: 1,
      material: { restitution: 0.08 },
      ccd: true,
      pieces: [{ id: 'bar-material', localPolygon: rectangle(3.2, 0.55) }],
    },
  ],
  staticBodies: [
    rail('left-boundary', -5.5, 0, 0.5, 8),
    rail('right-boundary', 5.5, 0, 0.5, 8),
    rail('bottom-boundary', 0, -4, 10.5, 0.5),
    rail('top-boundary', 0, 4, 10.5, 0.5),
    rail('gate-top', 0.3, 2.475, 0.45, 2.55),
    rail('gate-bottom', 0.3, -2.475, 0.45, 2.55),
  ],
  fields: [
    {
      id: 'lift-field',
      localPolygon: [
        { x: -0.78, y: -0.9 },
        { x: 0.78, y: -0.9 },
        { x: 1.15, y: 0.9 },
        { x: -1.15, y: 0.9 },
      ],
      position: { x: -3.35, y: 1.05 },
      angle: 0,
      forceDensityLocal: { x: 5.5, y: 0 },
      enabled: false,
    },
  ],
  prediction: { maxTicks: 2400, sampleEveryTicks: 12 },
};
