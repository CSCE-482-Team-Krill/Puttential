import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vercelBuildSteps } from '../scripts/build-vercel';

test('only Vercel Production releases migrate and provision courses after compiling', () => {
  const production = {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/puttential_test',
    APP_ORIGIN: 'https://puttential.vercel.app',
    CRON_SECRET: 'test-only-secret',
  };
  assert.deepEqual(vercelBuildSteps(production), [
    'generate',
    'build',
    'migrate',
    'publish',
    'check',
  ]);
  for (const env of [
    {},
    { NODE_ENV: 'production' },
    { ...production, VERCEL: '0' },
    { ...production, VERCEL_ENV: 'preview' },
    { ...production, VERCEL_ENV: 'development' },
  ])
    assert.deepEqual(vercelBuildSteps(env), ['generate', 'build']);
  for (const key of ['DATABASE_URL', 'APP_ORIGIN', 'CRON_SECRET'])
    assert.throws(() => vercelBuildSteps({ ...production, [key]: '' }), new RegExp(key));
});
