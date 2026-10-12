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
/** Editor metadata for the engine's supported force union. No parallel force laws. */
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
} satisfies Record<FieldForceDefinition['kind'], ForceDefinition>;
export const forceCatalog: readonly ForceDefinition[] = Object.values(definitions);
export function forceDefinition(kind: string): ForceDefinition {
  const definition = forceCatalog.find((f) => f.kind === kind);
  if (!definition) throw new Error(`Unsupported force: ${kind}`);
  return definition;
}
