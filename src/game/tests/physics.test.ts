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

  it('turns the example bar clockwise when its top is pushed right', async () => {
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
      expect(bar.linearVelocity.x).toBeGreaterThan(0);
      expect(bar.angularVelocity).toBeLessThan(0);
    } finally {
      game.destroy();
    }
  });

  it('lets the default example setup reach and hold the capture goal', async () => {
    const game = await createGame(exampleBarPuzzle);
    try {
      game.queueCommand({
        type: 'set-field-enabled',
        fieldId: 'lift-field',
        enabled: true,
        sequence: 1,
      });
      let chargeTicks = 0;
      for (let tick = 0; tick < 3600 && chargeTicks < 120; tick += 1) {
        game.step();
        const position = game.getRenderState().bodies[0]!.position;
        const inside = position.x >= 0.85 && position.x <= 4.85 && position.y >= -2.15 && position.y <= 2.15;
        chargeTicks = inside ? chargeTicks + 1 : Math.max(0, chargeTicks - 0.35);
      }
      expect(chargeTicks).toBeGreaterThanOrEqual(120);
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
          material: { restitution: 0 },
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
          material: { restitution: 0 },
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

  it('preserves tangential speed during frictionless contact', async () => {
    const level: Level = {
      id: 'frictionless-contact-test',
      version: 1,
      gravity: { x: 0, y: 0 },
      dynamicBodies: [
        {
          id: 'slider',
          position: { x: 0, y: 0.7 },
          angle: 0,
          linearVelocity: { x: 2, y: -10 },
          density: 1,
          material: { restitution: 0 },
          ccd: true,
          canSleep: false,
          pieces: [{ id: 'slider-piece', localPolygon: rectangle(0.2, 0.2) }],
        },
      ],
      staticBodies: [
        {
          id: 'floor',
          position: { x: 0, y: 0 },
          angle: 0,
          material: { restitution: 0 },
          pieces: [{ id: 'floor-piece', localPolygon: rectangle(8, 0.2) }],
        },
      ],
      fields: [],
    };

    const game = await createGame(level);
    try {
      for (let tick = 0; tick < 20; tick += 1) game.step();
      const slider = game.getRenderState().bodies[0]!;
      expect(slider.linearVelocity.x).toBeCloseTo(2, 5);
      expect(Math.abs(slider.linearVelocity.y)).toBeLessThan(0.01);
    } finally {
      game.destroy();
    }
  });
});
