import { documentFromLevel } from '../src/game/levels/document';
import { decodeLevel } from '../src/game/levels/codec';
import { defaultRules, makePlacement } from '../src/game/run-evaluation';
import { isCourseObject } from '../src/game/objects/catalog';
import { successLevel } from './ui-polish-fixtures';
import type { CommunityMapSummary, CommunityMapDetail } from '../src/shared/community-maps';

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

export function communityDetailFixture(summary: CommunityMapSummary): CommunityMapDetail {
  const { document } = communityPublishingFixture();
  const configuration = document.level;
  const rules = defaultRules(configuration);
  return {
    ...summary,
    configuration,
    rules,
    competition: {
      id: summary.id,
      date: null,
      communityMapId: summary.id,
      title: summary.title,
      seed: '',
      difficulty: 0,
      configuration,
      rules,
      availability: {
        puzzleId: summary.id,
        revision: '0',
        publicationStatus: 'active',
        canceledAt: null,
        cancellationMessage: null,
      },
      serverNow: '2026-11-12T17:00:00.000Z',
      todayDate: '2026-11-12',
      nextDailyAt: '2026-11-13T06:00:00.000Z',
    },
  };
}
