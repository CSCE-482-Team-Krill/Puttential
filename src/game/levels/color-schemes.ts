/** Presentation only: schemes never participate in physics or scoring. */
export const LEVEL_COLOR_SCHEMES = [
  'classic',
  'lagoon',
  'sandstone',
  'rose',
  'lavender',
  'slate',
  'black',
  'yellow',
] as const;
export type LevelColorPreset = (typeof LEVEL_COLOR_SCHEMES)[number];
export type CustomLevelColors = Readonly<{ kind: 'custom'; primary: string; secondary: string }>;
export type LevelColorScheme = LevelColorPreset | CustomLevelColors;

export function isLevelColorScheme(value: unknown): value is LevelColorScheme {
  if (typeof value === 'string') return LEVEL_COLOR_SCHEMES.some((scheme) => scheme === value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const custom = value as Record<string, unknown>;
  const keys = Object.keys(custom);
  const hex = /^#[0-9a-f]{6}$/i;
  return (
    keys.length === 3 &&
    keys.every((key) => ['kind', 'primary', 'secondary'].includes(key)) &&
    custom.kind === 'custom' &&
    typeof custom.primary === 'string' &&
    hex.test(custom.primary) &&
    typeof custom.secondary === 'string' &&
    hex.test(custom.secondary)
  );
}
