import { describe, expect, it } from 'vitest';
import { rectangle, transformPolygon } from '../geometry/polygon';
import type { FieldZoneDefinition } from '../levels/types';
import { calculateFieldLoad } from '../objects/fields';
import type { FieldState } from '../types';

function fieldAt(x: number, enabled = true): {
  definition: FieldZoneDefinition;
  state: FieldState;
} {
  return {
    definition: {
      id: 'field',
      localPolygon: rectangle(2, 2),
      position: { x, y: 0 },
      angle: 0,
      forceDensityLocal: { x: 0, y: 10 },
      enabled,
    },
    state: { id: 'field', position: { x, y: 0 }, angle: 0, enabled },
  };
}

const bar = {
  position: { x: 0, y: 0 },
  angle: 0,
  centerOfMass: { x: 0, y: 0 },
  pieces: [{ id: 'bar', localPolygon: rectangle(4, 1) }],
};

describe('uniform polygonal field loads', () => {
  it('produces equal and opposite torque on mirrored halves of a bar', () => {
    const right = calculateFieldLoad(bar, [fieldAt(1)]);
    const left = calculateFieldLoad(bar, [fieldAt(-1)]);
    expect(right.force.x).toBeCloseTo(0, 12);
    expect(right.force.y).toBeCloseTo(20, 12);
    expect(right.torque).toBeCloseTo(20, 12);
    expect(left.force.y).toBeCloseTo(right.force.y, 12);
    expect(left.torque).toBeCloseTo(-right.torque, 12);
  });

  it('produces no force or torque without overlap', () => {
    expect(calculateFieldLoad(bar, [fieldAt(10)])).toEqual({
      force: { x: 0, y: 0 },
      torque: 0,
    });
  });

  it('rotates force density with the field', () => {
    const field = fieldAt(0);
    field.definition = {
      ...field.definition,
      localPolygon: rectangle(2, 6),
      angle: Math.PI / 2,
    };
    field.state = { ...field.state, angle: Math.PI / 2 };
    const load = calculateFieldLoad(bar, [field]);
    expect(load.force.x).toBeCloseTo(-40, 12);
    expect(load.force.y).toBeCloseTo(0, 12);
    expect(load.torque).toBeCloseTo(0, 12);
  });

  it('computes torque around the whole compound body center of mass', () => {
    const compound = {
      position: { x: 0, y: 0 },
      angle: 0,
      centerOfMass: { x: 0, y: 0 },
      pieces: [
        { id: 'left', localPolygon: transformPolygon(rectangle(1, 1), { x: -1.5, y: 0 }, 0) },
        { id: 'right', localPolygon: transformPolygon(rectangle(1, 1), { x: 1.5, y: 0 }, 0) },
      ],
    };
    const field = fieldAt(1.5);
    field.definition = { ...field.definition, localPolygon: rectangle(1, 1) };
    const load = calculateFieldLoad(compound, [field]);
    expect(load.force.y).toBeCloseTo(10, 12);
    expect(load.torque).toBeCloseTo(15, 12);
  });
});
