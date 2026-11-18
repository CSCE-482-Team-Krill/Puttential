import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archiveMonthRange,
  archiveYears,
  canShiftMonth,
  canShiftYear,
  clampMonth,
  monthInRange,
  shiftMonth,
  shiftYear,
} from '../src/frontend/archive-calendar';

test('archive months are limited to October 2026 through two future months', () => {
  const november = archiveMonthRange('2026-11-17');
  assert.deepEqual(november, { min: '2026-10', max: '2027-01' });
  assert.equal(monthInRange('2026-09', november), false);
  assert.equal(monthInRange('2026-10', november), true);
  assert.equal(monthInRange('2026-12', november), true);
  assert.equal(monthInRange('2027-01', november), true);
  assert.equal(monthInRange('2027-02', november), false);
  assert.equal(clampMonth('2025-12', november), '2026-10');
  assert.equal(clampMonth('2027-02', november), '2027-01');
});

test('future-month allowance crosses a year boundary', () => {
  const december = archiveMonthRange('2026-12-31');
  assert.deepEqual(december, { min: '2026-10', max: '2027-02' });
  assert.deepEqual(archiveYears(december), [2026, 2027]);
  assert.equal(canShiftYear('2026-12', 1, december), true);
  assert.equal(shiftYear('2026-12', 1, december), '2027-02');
  assert.equal(canShiftYear('2027-02', -1, december), true);
  assert.equal(shiftYear('2027-02', -1, december), '2026-10');
});

test('month and year navigation works across a simulated multi-year range', () => {
  const range = archiveMonthRange('2028-06-15');
  assert.deepEqual(range, { min: '2026-10', max: '2028-08' });
  assert.deepEqual(archiveYears(range), [2026, 2027, 2028]);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(canShiftMonth('2028-08', 1, range), false);
  assert.equal(canShiftYear('2026-10', 1, range), true);
  assert.equal(shiftYear('2026-10', 1, range), '2027-10');
  assert.equal(shiftYear('2027-10', 1, range), '2028-08');
  assert.equal(shiftYear('2028-08', -1, range), '2027-08');
  assert.equal(canShiftYear('2028-08', 1, range), false);
});
