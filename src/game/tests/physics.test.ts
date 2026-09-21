import { describe, expect, it } from 'vitest';
import { rectangle } from '../geometry/polygon';
import { exampleBarPuzzle } from '../levels/example-bar-puzzle';
import type { Level } from '../levels/types';
import { validateLevel } from '../levels/validate';
import { createGame } from '../simulation';

describe('Rapier integration', () => {
  it('constructs the example bar puzzle as a valid level', () => {
    expect(() => validateLevel(exampleBarPuzzle)).not.toThrow();
  });

  it('turns the example bar counter-clockwise when its right side is lifted', async () => {
    const game = await createGame(exampleBarPuzzle);
    try {
      game.queueCommand({
        type: 'set-field-enabled',
        fieldId: 'lift-field',
        enabled: true,
        sequence: 1,
      });
      game.step();
      const bar = game.getRenderState().bodies.find((body) => body.id === 'bar')!;
      expect(bar.linearVelocity.y).toBeGreaterThan(0);
      expect(bar.angularVelocity).toBeGreaterThan(0);
    } finally {
      game.destroy();
    }
  });

  it('uses CCD to stop a fast body at a thin wall', async () => {
    const level: Level = {
      id: 'ccd-test',
      version: 1,
      gravity: { x: 0, y: 0 },
      dynamicBodies: [
        {
          id: 'projectile',
          position: { x: -1, y: 0 },
          angle: 0,
          linearVelocity: { x: 300, y: 0 },
          density: 1,
          material: { friction: 0, restitution: 0 },
          ccd: true,
          canSleep: false,
          pieces: [{ id: 'projectile-piece', localPolygon: rectangle(0.2, 0.2) }],
        },
      ],
      staticBodies: [
        {
          id: 'wall',
          position: { x: 0, y: 0 },
          angle: 0,
          material: { friction: 0, restitution: 0 },
          pieces: [{ id: 'wall-piece', localPolygon: rectangle(0.1, 3) }],
        },
      ],
      fields: [],
    };

    const game = await createGame(level);
    try {
      game.step();
      const projectile = game.getRenderState().bodies[0]!;
      expect(projectile.position.x).toBeLessThan(-0.14);
    } finally {
      game.destroy();
    }
  });
});
