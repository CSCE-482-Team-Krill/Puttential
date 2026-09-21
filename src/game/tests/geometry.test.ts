import { describe, expect, it } from 'vitest';
import { intersectConvexPolygons } from '../geometry/intersection';
import { polygonAreaAndCentroid } from '../geometry/mass';
import { convexPolygonValidationError, rectangle, transformPolygon } from '../geometry/polygon';

describe('convex polygon validation', () => {
  it('accepts convex counter-clockwise polygons', () => {
    expect(convexPolygonValidationError(rectangle(4, 2))).toBeNull();
  });

  it('rejects clockwise polygons', () => {
    expect(convexPolygonValidationError([...rectangle(4, 2)].reverse())).toMatch(/counter-clockwise/);
  });

  it('rejects self-intersecting polygons', () => {
    expect(
      convexPolygonValidationError([
        { x: -1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
        { x: 1, y: -1 },
      ]),
    ).toMatch(/self-intersecting/);
  });

  it('rejects degenerate and non-convex polygons', () => {
    expect(
      convexPolygonValidationError([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toMatch(/zero area/);
    expect(
      convexPolygonValidationError([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 0.5 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ]),
    ).toMatch(/convex/);
  });
});

describe('convex polygon intersection', () => {
  it('returns the expected area and centroid for offset rectangles', () => {
    const overlap = intersectConvexPolygons(
      rectangle(4, 2),
      transformPolygon(rectangle(4, 2), { x: 2, y: 0.5 }, 0),
    );
    const result = polygonAreaAndCentroid(overlap);
    expect(result).not.toBeNull();
    expect(result!.area).toBeCloseTo(3, 12);
    expect(result!.centroid.x).toBeCloseTo(1, 12);
    expect(result!.centroid.y).toBeCloseTo(0.25, 12);
  });

  it('returns an empty polygon for disjoint shapes', () => {
    const overlap = intersectConvexPolygons(
      rectangle(1, 1),
      transformPolygon(rectangle(1, 1), { x: 2, y: 0 }, 0),
    );
    expect(overlap).toEqual([]);
  });

  it('clips rotated convex polygons deterministically', () => {
    const diamond = transformPolygon(rectangle(2, 2), { x: 0, y: 0 }, Math.PI / 4);
    const result = polygonAreaAndCentroid(intersectConvexPolygons(rectangle(2, 2), diamond));
    expect(result!.area).toBeCloseTo(3.31370849898, 10);
    expect(result!.centroid.x).toBeCloseTo(0, 12);
    expect(result!.centroid.y).toBeCloseTo(0, 12);
  });
});
