import { rectangle } from '../geometry/polygon';
import type { Level, StaticBodyDefinition } from './types';

const railMaterial = { friction: 0.55, restitution: 0.05 } as const;

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
 * A horizontal bar starts below a narrow gate. Moving the field over one end
 * gives the bar both upward motion and the torque needed to turn through it.
 * World coordinates use +Y as up.
 */
export const exampleBarPuzzle: Level = {
  id: 'bar-through-gate',
  version: 1,
  gravity: { x: 0, y: 0 },
  dynamicBodies: [
    {
      id: 'bar',
      position: { x: 0, y: -2.35 },
      angle: 0,
      linearVelocity: { x: 0, y: 0 },
      angularVelocity: 0,
      density: 1,
      material: { friction: 0.4, restitution: 0.08 },
      linearDamping: 0.7,
      angularDamping: 0.9,
      ccd: true,
      pieces: [{ id: 'bar-material', localPolygon: rectangle(3.2, 0.55) }],
    },
  ],
  staticBodies: [
    rail('left-boundary', -4.25, 0, 0.5, 8.5),
    rail('right-boundary', 4.25, 0, 0.5, 8.5),
    rail('bottom-boundary', 0, -4.25, 8, 0.5),
    rail('top-boundary', 0, 4.25, 8, 0.5),
    rail('gate-left', -2.5, 0.3, 3.8, 0.45),
    rail('gate-right', 2.5, 0.3, 3.8, 0.45),
  ],
  fields: [
    {
      id: 'lift-field',
      localPolygon: rectangle(1.7, 1.8),
      position: { x: 1.05, y: -2.35 },
      angle: 0,
      forceDensityLocal: { x: 0, y: 8 },
      enabled: false,
    },
  ],
  prediction: { maxTicks: 1200, sampleEveryTicks: 8 },
};
