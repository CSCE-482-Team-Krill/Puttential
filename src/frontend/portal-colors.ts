import type { FieldForceDefinition } from '../game';

const cache = new WeakMap<
  readonly { force: FieldForceDefinition }[],
  ReadonlyMap<string, string>
>();
const palette = ['#759ce1', '#ad83cf', '#46a6a0', '#d19159', '#d56e91', '#8b9b45'];

/** Assign once in authored order, so adding or copying a pair gives it a fresh color. */
export function portalPairColors(
  fields: readonly { force: FieldForceDefinition }[],
): ReadonlyMap<string, string> {
  const existing = cache.get(fields);
  if (existing) return existing;
  const colors = new Map<string, string>();
  for (const { force } of fields) {
    if (force.kind !== 'portal' || colors.has(force.pairId)) continue;
    const index = colors.size;
    colors.set(
      force.pairId,
      palette[index] ?? `hsl(${((index - palette.length) * 137.508 + 25) % 360} 62% 56%)`,
    );
  }
  cache.set(fields, colors);
  return colors;
}
