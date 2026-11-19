import { spawnSync } from 'node:child_process';
import path from 'node:path';

type BuildStep = 'generate' | 'build' | 'migrate' | 'publish' | 'check';

/** Only a Vercel Production release may maintain the production database. */
export function vercelBuildSteps(env: NodeJS.ProcessEnv): BuildStep[] {
  const steps: BuildStep[] = ['generate', 'build'];
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') return steps;
  for (const key of ['DATABASE_URL', 'APP_ORIGIN', 'CRON_SECRET']) {
    if (!env[key]?.trim()) throw new Error(`Production release requires ${key}.`);
  }
  // Compile first. A failed build must not change the live database.
  return [...steps, 'migrate', 'publish', 'check'];
}

export function buildVercel(env = process.env) {
  const root = path.resolve(__dirname, '..');
  const frontend = path.join(root, 'src/frontend');
  for (const step of vercelBuildSteps(env)) {
    const command = {
      generate: [
        require.resolve('prisma/build/index.js'),
        'generate',
        '--config',
        'prisma7.config.ts',
      ],
      build: [require.resolve('next/dist/bin/next'), 'build'],
      migrate: [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--config',
        'prisma7.config.ts',
      ],
      publish: [require.resolve('tsx/cli'), 'src/backend/publish.ts', 'schedule'],
      check: [require.resolve('tsx/cli'), 'src/backend/publish.ts', 'check'],
    }[step];
    console.log(`Vercel release: ${step}`);
    const result = spawnSync(process.execPath, command, {
      cwd: step === 'build' ? frontend : root,
      env,
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) throw new Error(`Vercel release failed: ${step}.`);
  }
}

if (require.main === module) {
  try {
    buildVercel();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Vercel release failed.');
    process.exitCode = 1;
  }
}
