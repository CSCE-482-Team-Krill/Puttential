import bar from './bar-around-corner.json';
import radial from './radial-relay.json';
import tutorial from './tutorial.json';
import { parseLevel } from './parse';
import { documentFromLevel } from './document';
const starters = [
  { level: parseLevel(bar), suffix: 'boundary' },
  { level: parseLevel(radial), suffix: 'rail' },
];
export const starterLevels = starters.map((entry) => entry.level);
export const tutorialLevel = parseLevel(tutorial);
export function starterDocument(index: number) {
  const starter = starters[index];
  if (!starter) throw new Error('Unknown starter');
  return documentFromLevel(
    starter.level,
    ['left', 'right', 'bottom', 'top'].map((side) => `${side}-${starter.suffix}`),
  );
}
