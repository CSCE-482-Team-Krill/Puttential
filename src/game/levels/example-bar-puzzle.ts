import { rectangle } from '../geometry/polygon';
import type { Level, StaticBodyDefinition } from './types';

const railMaterial = { restitution: 0.01 } as const;

function rail(id: string, x: number, y: number, width: number, height: number): StaticBodyDefinition {
  return {
    id,
    position: { x, y },
    angle: 0,
    material: railMaterial,
    pieces: [{ id: `${id}-piece`, localPolygon: rectangle(width, height) }],
  };
}

/** The solid divider forces a downward turn before the bar can travel right. */
export const exampleGoal = {
  minX: 3.45,
  maxX: 6.35,
  minY: -3.4,
  maxY: -1.3,
  holdSeconds: 1,
} as const;

export const exampleBarPuzzle: Level = {
  id: 'bar-around-corner',
  version: 3,
  gravity: { x: 0, y: 0 },
  dynamicBodies: [
    {
      id: 'bar',
      position: { x: -4.8, y: 1.45 },
      angle: 0,
      linearVelocity: { x: 0, y: 0 },
      angularVelocity: 0,
      density: 1,
      material: { restitution: 0.01 },
      ccd: true,
      pieces: [{ id: 'bar-material', localPolygon: rectangle(2.4, 0.55) }],
    },
  ],
  staticBodies: [
    rail('left-boundary', -7.15, 0, 0.5, 8.5),
    rail('right-boundary', 7.15, 0, 0.5, 8.5),
    rail('bottom-boundary', 0, -4, 14.8, 0.5),
    rail('top-boundary', 0, 4, 14.8, 0.5),
    rail('turn-divider', 0.65, 0.875, 0.5, 5.75),
    rail('lower-entry-guide', -2.15, -2.65, 1.2, 0.3),
    rail('upper-exit-guide', 2.3, 2.8, 1.6, 0.3),
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
      forceDensityLocal: { x: 0, y: -5.5 },
      enabled: false,
    },
    {
      id: 'push-field',
      localPolygon: rectangle(2.8, 1.8),
      position: { x: -4.45, y: -2.25 },
      angle: 0,
      forceDensityLocal: { x: 5.5, y: 0 },
      enabled: false,
    },
  ],
  prediction: { maxTicks: 2400, sampleEveryTicks: 12 },
};
