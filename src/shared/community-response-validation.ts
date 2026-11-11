import { parseLevel } from '../game/levels/parse';
import { decodePuzzleRules } from './response-validation';
import type { CommunityMapDetail, CommunityMapList, CommunityMapSummary } from './community-maps';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid community response');
}
const text = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && [...value].length >= min && [...value].length <= max;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function decodeCommunitySummary(value: unknown): CommunityMapSummary {
  check(object(value));
  check(
    uuid(value.id) &&
      text(value.title, 3, 80) &&
      text(value.description, 0, 1000) &&
      text(value.creatorName, 3, 80) &&
      typeof value.createdAt === 'string' &&
      Number.isFinite(Date.parse(value.createdAt)) &&
      new Date(value.createdAt).toISOString() === value.createdAt,
  );
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    creatorName: value.creatorName,
    createdAt: value.createdAt,
  };
}

export function decodeCommunityList(value: unknown, requestedCursor?: string): CommunityMapList {
  check(object(value) && Array.isArray(value.items) && value.items.length <= 20);
  const items = value.items.map(decodeCommunitySummary);
  check(new Set(items.map((item) => item.id)).size === items.length);
  check(
    value.nextCursor === null ||
      (uuid(value.nextCursor) &&
        value.nextCursor !== requestedCursor &&
        value.nextCursor === items.at(-1)?.id),
  );
  return { items, nextCursor: value.nextCursor };
}

export function decodeCommunityMap(value: unknown, requestedId: string): CommunityMapDetail {
  check(object(value) && object(value.map));
  const map = value.map;
  const summary = decodeCommunitySummary(map);
  check(summary.id === requestedId);
  const configuration = parseLevel(map.configuration);
  const rules = decodePuzzleRules(map.rules, configuration);
  return { ...summary, configuration, rules };
}

export function decodeCommunityPublication(value: unknown): { map: CommunityMapSummary } {
  check(object(value));
  return { map: decodeCommunitySummary(value.map) };
}
