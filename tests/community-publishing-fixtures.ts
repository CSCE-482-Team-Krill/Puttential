import { documentFromLevel } from '../src/game/levels/document';
import { decodeLevel } from '../src/game/levels/codec';
import { defaultRules, makePlacement } from '../src/game/run-evaluation';
import { isCourseObject } from '../src/game/objects/catalog';
import { successLevel } from './ui-polish-fixtures';

export function communityPublishingFixture() {
  const document = documentFromLevel({
    ...successLevel,
    prediction: { maxTicks: 1200, sampleEveryTicks: 8 },
  });
  document.editor.name = 'Community publishing test';
  const level = decodeLevel({ ...document.level, bounds: document.editor.arena.bounds });
  const placement = makePlacement(
    level,
    Object.fromEntries(
      level.fields
        .filter((field) => !isCourseObject(field.force))
        .map((field) => [
          field.id,
          { position: field.position, angle: field.angle, enabled: field.enabled },
        ]),
    ),
    defaultRules(level),
  );
  return { document, placement };
}
