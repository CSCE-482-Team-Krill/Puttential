import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portalPairColors } from '../src/frontend/portal-colors';

test('portal ends match and newly added or copied pairs receive unique colors', () => {
  const fields = Array.from({ length: 20 }, (_, i) => ({
    force: { kind: 'portal' as const, pairId: `pair-${Math.floor(i / 2)}`, rotateVelocity: false },
  }));
  const colors = portalPairColors(fields);
  assert.equal(colors.size, 10);
  assert.equal(new Set(colors.values()).size, 10);
  assert.equal(colors.get(fields[0]!.force.pairId), colors.get(fields[1]!.force.pairId));
  const extra = [
    ...fields,
    { force: { kind: 'portal' as const, pairId: 'copy-pair', rotateVelocity: false } },
  ];
  const newColors = portalPairColors(extra);
  for (const [id, color] of colors) assert.equal(newColors.get(id), color);
  assert.equal(new Set(newColors.values()).size, 11);
});
