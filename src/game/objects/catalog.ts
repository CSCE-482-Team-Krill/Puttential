import type { FieldForceDefinition } from '../levels/types';
import type { Vec2 } from '../types';
export type FieldParam = number | string | boolean | Vec2;
export type Parameter = Readonly<{
  label: string;
  type: 'number' | 'vector' | 'boolean' | 'string';
  default: FieldParam;
}>;
type ForceDefinition = {
  kind: FieldForceDefinition['kind'];
  label: string;
  glyph: string;
  parameters: Readonly<Record<string, Parameter>>;
  create: () => FieldForceDefinition;
};
export const PORTAL_DELAY_SECONDS = 0.25;
export const PORTAL_COOLDOWN_SECONDS = 0.75;

/** Fixed course objects share field geometry, serialization and inspector controls. */
export function isCourseObject(force: Pick<FieldForceDefinition, 'kind'>): boolean {
  return ['water', 'lava', 'portal'].includes(force.kind);
}
/** Editor metadata for every supported field kind. */
const definitions = {
  uniform: {
    kind: 'uniform',
    label: 'Directional force',
    glyph: '→',
    parameters: { density: { label: 'Force density', type: 'vector', default: { x: 4, y: 0 } } },
    create: () => ({ kind: 'uniform', density: { x: 4, y: 0 } }),
  },
  attractor: {
    kind: 'attractor',
    label: 'Attractor',
    glyph: '◎',
    parameters: {
      source: { label: 'Local source', type: 'vector', default: { x: 0, y: 0 } },
      strength: { label: 'Strength', type: 'number', default: 4 },
    },
    create: () => ({ kind: 'attractor', source: { x: 0, y: 0 }, strength: 4 }),
  },
  repulsor: {
    kind: 'repulsor',
    label: 'Repulsor',
    glyph: '✺',
    parameters: {
      source: { label: 'Local source', type: 'vector', default: { x: 0, y: 0 } },
      strength: { label: 'Strength', type: 'number', default: 4 },
    },
    create: () => ({ kind: 'repulsor', source: { x: 0, y: 0 }, strength: 4 }),
  },
  water: {
    kind: 'water',
    label: 'Water',
    glyph: '≈',
    parameters: {
      drag: { label: 'Water drag', type: 'number', default: 12 },
      sinkSpeed: { label: 'Sink speed threshold', type: 'number', default: 0.06 },
    },
    create: () => ({ kind: 'water', drag: 12, sinkSpeed: 0.06 }),
  },
  lava: {
    kind: 'lava',
    label: 'Lava',
    glyph: '♨',
    parameters: {},
    create: () => ({ kind: 'lava' }),
  },
  portal: {
    kind: 'portal',
    label: 'Portal pair',
    glyph: '◉',
    parameters: {
      pairId: { label: 'Portal pair ID', type: 'string', default: 'portal-pair' },
      rotateVelocity: { label: 'Rotate velocity with exit', type: 'boolean', default: false },
      delaySeconds: {
        label: 'Teleport delay (seconds)',
        type: 'number',
        default: PORTAL_DELAY_SECONDS,
      },
      cooldownSeconds: {
        label: 'Teleport cooldown (seconds)',
        type: 'number',
        default: PORTAL_COOLDOWN_SECONDS,
      },
    },
    create: () => ({
      kind: 'portal',
      pairId: 'portal-pair',
      rotateVelocity: false,
      delaySeconds: PORTAL_DELAY_SECONDS,
      cooldownSeconds: PORTAL_COOLDOWN_SECONDS,
    }),
  },
} satisfies Record<FieldForceDefinition['kind'], ForceDefinition>;
export const forceCatalog: readonly ForceDefinition[] = Object.values(definitions);
export function forceDefinition(kind: string): ForceDefinition {
  const definition = forceCatalog.find((f) => f.kind === kind);
  if (!definition) throw new Error(`Unsupported force: ${kind}`);
  return definition;
}
