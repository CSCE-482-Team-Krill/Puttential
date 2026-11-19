import type { LevelColorPreset, LevelColorScheme } from '../game/levels/color-schemes';

export type LevelPalette = Readonly<{ label: string; background: string; walls: string }>;

/** Coordinated background/wall pairs; all other object colors stay independent. */
export const levelPalettes: Readonly<Record<LevelColorPreset, LevelPalette>> = {
  classic: { label: 'Classic green', background: '#dff3d9', walls: '#2e7d32' },
  lagoon: { label: 'Lagoon', background: '#dceff0', walls: '#28656c' },
  sandstone: { label: 'Sandstone', background: '#f2e4ce', walls: '#866340' },
  rose: { label: 'Rose garden', background: '#f3e1e8', walls: '#914d69' },
  lavender: { label: 'Lavender', background: '#e7e3f3', walls: '#66528d' },
  slate: { label: 'Slate', background: '#e1e7ee', walls: '#465c75' },
  black: { label: 'Black', background: '#181c22', walls: '#8994a5' },
  yellow: { label: 'Yellow', background: '#fff2b3', walls: '#a97812' },
};

export function levelPalette(scheme: LevelColorScheme = 'classic'): LevelPalette {
  return typeof scheme === 'string'
    ? levelPalettes[scheme]
    : { label: 'Custom', background: scheme.primary, walls: scheme.secondary };
}
