import { readFile } from 'node:fs/promises';
import { prisma } from './prisma';
import { parseLevel } from '../game';
import { defaultRules } from '../game/run-evaluation';
import { cancelPuzzle } from './competitive';
import { checkSchedule, publishCourse, publishSchedule, recoverRuns } from './course-publishing';

/** Command-line entry point. The same functions also run from the daily cron route. */
async function main() {
  const [command = 'schedule', file, dateArg] = process.argv.slice(2);
  if (command === 'schedule') {
    for (const line of await publishSchedule()) console.log(line);
  } else if (command === 'course') {
    if (!file || !dateArg)
      throw new Error('Usage: npm run courses:publish -- course reviewed-course.json YYYY-MM-DD');
    const spec = JSON.parse(await readFile(file, 'utf8'));
    const level = parseLevel(spec.configuration);
    console.log(
      await publishCourse(
        dateArg,
        level,
        spec.rules ?? defaultRules(level),
        spec.title,
        spec.solutions,
      ),
    );
  } else if (command === 'check') {
    for (const line of await checkSchedule()) console.log(line);
  } else if (command === 'recover') {
    console.log(await recoverRuns());
  } else if (command === 'cancel') {
    if (!file || !dateArg?.trim())
      throw new Error('Usage: npm run courses:publish -- cancel YYYY-MM-DD "Reason"');
    await cancelPuzzle(file, dateArg);
    console.log(`${file}: canceled; historical verification retained and ranking removed.`);
  } else throw new Error('Commands: schedule, course, check, recover, cancel');
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'Publishing failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
