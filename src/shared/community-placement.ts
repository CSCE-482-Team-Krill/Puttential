import type { Level } from '../game/levels/types';
import { isCourseObject } from '../game/objects/catalog';
import { validatePlacement } from '../game/run-evaluation';
import type { Placement, PuzzleRules } from './puzzle-contracts';

/** Validate the complete public proof DTO before it reaches setup or persistence. */
export function validateCommunityPlacement(
  level: Level,
  rules: PuzzleRules,
  input: unknown,
): Placement {
  const exactObject = (value: unknown, keys: string[]) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new Error('Invalid placement properties');
  };
  exactObject(input, ['levelId', 'levelVersion', 'rulesVersion', 'simulationVersion', 'commands']);
  const placement = input as Placement;
  const selectable = new Set(
    level.fields.filter((field) => !isCourseObject(field.force)).map((field) => field.id),
  );
  if (
    !Array.isArray(placement.commands) ||
    placement.commands.length !== selectable.size * (rules.rotationAllowed ? 3 : 2)
  )
    throw new Error('Expected the exact tile inventory');
  for (const command of placement.commands) {
    if (
      !command ||
      !selectable.has(command.fieldId) ||
      !['move-field', 'set-field-angle', 'set-field-enabled'].includes(command.type)
    )
      throw new Error('Unknown or fixed placement tile');
    exactObject(
      command,
      command.type === 'move-field'
        ? ['type', 'fieldId', 'sequence', 'xQ', 'yQ']
        : command.type === 'set-field-angle'
          ? ['type', 'fieldId', 'sequence', 'angleQ']
          : ['type', 'fieldId', 'sequence', 'enabled'],
    );
  }
  validatePlacement(level, placement, rules);
  return placement;
}
