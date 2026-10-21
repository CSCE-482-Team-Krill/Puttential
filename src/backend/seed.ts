import { readFile } from 'node:fs/promises';
import { Prisma } from '../../generated/prisma/client';
import { parseLevel } from '../game/levels/parse';
import { starterLevels } from '../game/levels/starters';
import { prisma } from './prisma';
import { centralDateString } from './puzzle-date';

async function main() {
  // Optional canonical course JSON and date: npm run db:seed -- path/to/course.json YYYY-MM-DD
  const [file, requestedDate] = process.argv.slice(2);
  const date = requestedDate ?? centralDateString();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new Error('Use a valid YYYY-MM-DD puzzle date.');
  }
  const level = file ? parseLevel(JSON.parse(await readFile(file, 'utf8'))) : starterLevels[0]!;
  const puzzle = await prisma.puzzle.upsert({
    where: { date: new Date(`${date}T00:00:00Z`) },
    // Never replace a course that players may already have attempted.
    update: {},
    create: {
      date: new Date(`${date}T00:00:00Z`),
      seed: `puttential-${date}`,
      difficulty: 1,
      configuration: level as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  console.log(`Puzzle ready for ${date}: ${puzzle.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seeding failed.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
