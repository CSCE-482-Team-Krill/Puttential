import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RenderBody, Vec2 } from '../src/game';
import { directionHint } from '../src/frontend/direction-hint';

const bar: RenderBody = {
  id: 'bar',
  position: { x: 0, y: 0 },
  angle: 0,
  linearVelocity: { x: 0, y: 0 },
  angularVelocity: 0,
  sleeping: false,
  pieces: [
    {
      id: 'bar-piece',
      kind: 'polygon',
      worldPolygon: [
        { x: -1.2, y: -0.275 },
        { x: 1.2, y: -0.275 },
        { x: 1.2, y: 0.275 },
        { x: -1.2, y: 0.275 },
      ],
    },
  ],
};

test('slow bar shows three dots beyond its edge at desktop and mobile scales', () => {
  for (const scale of [20, 80]) {
    for (const direction of [
      { x: 1, y: 0 },
      { x: 0, y: -1 },
    ]) {
      const trail: Vec2[] = [bar.position, { x: direction.x * 0.001, y: direction.y * 0.001 }];
      const hint = directionHint(bar, trail, scale)!;
      const extent = direction.x ? 1.2 : 0.275;
      const distance = (point: Vec2) => Math.hypot(point.x, point.y);
      assert.equal(hint.dots.length, 3);
      hint.dots.forEach((dot, index) => {
        assert.ok(Math.abs((distance(dot) - extent) * scale - (index + 1) * 10) < 1e-8);
      });
      assert.ok(Math.abs((distance(hint.arrow.to) - extent) * scale - 46) < 1e-8);
    }
  }
});

test('hint reveals initial direction only, regardless of later bounces or goal position', () => {
  const start = [bar.position, { x: 0.001, y: 0 }];
  assert.deepEqual(
    directionHint(bar, [...start, { x: -20, y: 10 }, { x: 200, y: -100 }], 80),
    directionHint(bar, start, 80),
  );
});

test('stationary bodies and a disabled preview show no hint', () => {
  assert.equal(directionHint(bar, [], 80), null);
  assert.equal(directionHint(bar, [bar.position, bar.position], 80), null);
});
