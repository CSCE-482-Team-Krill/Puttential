import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  displayedForceCost,
  selectableFields,
  selectedFieldCount,
  TILE_COST,
} from '../src/frontend/score-display';
import { inventoryLevel } from './ui-polish-fixtures';
import { parseLevel } from '../src/game';
import type { FieldForceDefinition } from '../src/game';

test('UI inventory and costs use only the actual level fields and initialized draft state', () => {
  for (const count of [0, 1, 2, 3, 12]) {
    const level = parseLevel(inventoryLevel(count, { enabled: true }));
    const draft = Object.fromEntries(
      level.fields.map((field) => [field.id, { enabled: field.enabled, position: field.position }]),
    );
    draft['unrelated-draft-entry'] = { enabled: true, position: { x: 0, y: 0 } };
    assert.equal(selectableFields(level).length, count);
    assert.equal(selectedFieldCount(level, draft), count ? 1 : 0);
    assert.equal(displayedForceCost(level, draft), (count ? 1 : 0) * TILE_COST);
    assert.equal(displayedForceCost(level, {}), 0);
  }
  const complex = parseLevel(inventoryLevel(1, { long: true }));
  assert.equal(selectableFields(complex)[0]?.force.kind, 'attractor');
});

test('fixed course objects stay out of the force inventory and solution cost', () => {
  const base = inventoryLevel(1, { enabled: true });
  const forces: FieldForceDefinition[] = [
    { kind: 'water', drag: 12, sinkSpeed: 0.06 },
    { kind: 'lava' },
    {
      kind: 'portal',
      pairId: 'pair',
      rotateVelocity: false,
      delaySeconds: 0.25,
      cooldownSeconds: 0.75,
    },
  ];
  const courseObjects = forces.map((force, index) => ({
    ...base.fields[0]!,
    id: `course-object-${index}`,
    force,
  }));
  const level = parseLevel({ ...base, fields: [...base.fields, ...courseObjects] });
  // Even stale draft entries must never turn fixed geometry into a scored tile.
  const draft = Object.fromEntries(
    level.fields.map((field) => [field.id, { enabled: true, position: field.position }]),
  );
  assert.deepEqual(selectableFields(level), base.fields);
  assert.equal(selectedFieldCount(level, draft), 1);
  assert.equal(displayedForceCost(level, draft), TILE_COST);
  assert.deepEqual(selectableFields({ ...level, fields: courseObjects }), []);
  assert.equal(displayedForceCost({ ...level, fields: courseObjects }, draft), 0);
});
