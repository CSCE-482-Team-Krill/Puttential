import assert from 'node:assert/strict';
import test from 'node:test';
import { toCanvas, toWorld, type View } from '../src/frontend/course-view';

const bounds = { minX: -8, maxX: 8, minY: -5, maxY: 5 };

test('course projections round-trip points in horizontal and quarter-turned views', () => {
  const views: View[] = [
    { scale: 12, originX: 101, originY: 203, bounds, quarterTurn: false },
    { scale: 12, originX: 101, originY: 203, bounds, quarterTurn: true },
  ];
  for (const view of views) {
    for (const point of [
      { x: 0, y: 0 },
      { x: -4.25, y: 2.5 },
      { x: 7.75, y: -4.875 },
    ]) {
      const roundTrip = toWorld(view, toCanvas(view, point));
      assert.ok(Math.abs(roundTrip.x - point.x) < 1e-12);
      assert.ok(Math.abs(roundTrip.y - point.y) < 1e-12);
    }
  }
});

test('quarter turn maps world right down and world up right on screen', () => {
  const view: View = { scale: 10, originX: 50, originY: 80, bounds, quarterTurn: true };
  assert.deepEqual(toCanvas(view, { x: 1, y: 0 }), { x: 50, y: 90 });
  assert.deepEqual(toCanvas(view, { x: 0, y: 1 }), { x: 60, y: 80 });
});
