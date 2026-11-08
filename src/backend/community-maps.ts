import { createHash } from 'node:crypto';
import type { CommunityMap, Guest, Prisma } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { CompetitiveError } from './competitive';
import { convertCommunityImport, validateCommunityDocument } from '../shared/community-profile';
import { canonicalJson } from '../shared/community-canonical-json';
import { normalizePublicationMetadata } from '../shared/community-candidate';
import { decodeLevel } from '../game/levels/codec';
import { defaultRules, replayRun, validatePlacement } from '../game/run-evaluation';
import type { Placement } from '../shared/puzzle-contracts';
import type {
  CommunityMapDetail,
  CommunityMapList,
  CommunityMapSummary,
} from '../shared/community-maps';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const summarySelect = {
  id: true,
  title: true,
  description: true,
  creatorName: true,
  createdAt: true,
} as const;
function summary(map: Pick<CommunityMap, keyof typeof summarySelect>): CommunityMapSummary {
  return {
    id: map.id,
    title: map.title,
    description: map.description,
    creatorName: map.creatorName,
    createdAt: map.createdAt.toISOString(),
  };
}

export async function listCommunityMaps(params: URLSearchParams): Promise<CommunityMapList> {
  const cursor = params.get('cursor');
  if (cursor && !UUID.test(cursor))
    throw new CompetitiveError(400, 'INVALID_CURSOR', 'Invalid community page.');
  // A deleted/unknown cursor should return an empty page instead of a database error.
  if (
    cursor &&
    !(await prisma.communityMap.findUnique({ where: { id: cursor }, select: { id: true } }))
  )
    return { items: [], nextCursor: null };
  const maps = await prisma.communityMap.findMany({
    select: summarySelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return {
    items: maps.slice(0, 20).map(summary),
    nextCursor: maps.length > 20 ? maps[19]!.id : null,
  };
}

export async function readCommunityMap(id: string): Promise<CommunityMapDetail> {
  const map = UUID.test(id) ? await prisma.communityMap.findUnique({ where: { id } }) : null;
  if (!map) throw new CompetitiveError(404, 'NOT_FOUND', 'This community map could not be found.');
  return {
    ...summary(map),
    configuration: map.configuration as unknown as CommunityMapDetail['configuration'],
    rules: map.rules as unknown as CommunityMapDetail['rules'],
  };
}

/** MVP: verify in the Vercel request, then atomically insert an immutable map. */
export async function publishCommunityMap(guest: Guest, input: Record<string, unknown>) {
  if (typeof input.requestId !== 'string' || !UUID.test(input.requestId))
    throw new CompetitiveError(
      400,
      'INVALID_REQUEST',
      'A valid publishing request ID is required.',
    );
  let document, level, rules, metadata;
  const placement = input.placement as Placement;
  try {
    // Preview length does not affect simulation; keep existing editor imports publishable.
    document = validateCommunityDocument(
      convertCommunityImport(input.document, ['community-preview-limit']),
    );
    level = decodeLevel({ ...document.level, bounds: document.editor.arena.bounds });
    rules = defaultRules(level);
    metadata = normalizePublicationMetadata({
      title: input.title as string,
      description: input.description as string,
      creatorNameSnapshot: guest.nickname,
    });
    validatePlacement(level, placement, rules);
  } catch (error) {
    throw new CompetitiveError(
      400,
      'INVALID_MAP',
      error instanceof Error ? error.message : 'Invalid map or solution.',
    );
  }
  // Exclude the mutable nickname so an acknowledged publication can still be retried after a rename.
  const submissionHash = createHash('sha256')
    .update(
      canonicalJson({
        document,
        placement,
        title: metadata.title,
        description: metadata.description,
      }),
    )
    .digest('hex');
  const key = { authorId_requestId: { authorId: guest.id, requestId: input.requestId } };
  const existing = await prisma.communityMap.findUnique({ where: key });
  const acknowledged = (map: CommunityMap) => {
    if (map.submissionHash !== submissionHash)
      throw new CompetitiveError(
        409,
        'REQUEST_CONFLICT',
        'This request already published a different map. Publish again with a new request ID.',
      );
    return { map: summary(map) };
  };
  if (existing) return acknowledged(existing);
  if (
    (await prisma.communityMap.count({
      where: { authorId: guest.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    })) >= 10
  )
    throw new CompetitiveError(
      429,
      'RATE_LIMITED',
      'You can publish ten maps per hour. Please try again later.',
    );
  const result = await replayRun(level, placement, rules);
  if (result.outcome !== 'success')
    throw new CompetitiveError(
      422,
      'PROOF_FAILED',
      'The server could not solve this map with your test layout. Return to playtest, solve it, then publish again.',
    );
  const map = await prisma.communityMap.upsert({
    where: key,
    update: {},
    create: {
      authorId: guest.id,
      requestId: input.requestId,
      submissionHash,
      title: metadata.title,
      description: metadata.description,
      creatorName: metadata.creatorNameSnapshot,
      configuration: json(level),
      rules: json(rules),
      authorSolution: json(placement),
    },
  });
  return acknowledged(map);
}
