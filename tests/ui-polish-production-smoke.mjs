import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Run after game:build, with next dev stopped. Uses the real production server.
const workspace = fileURLToPath(new URL('../src/frontend/', import.meta.url));
const require = createRequire(new URL('../src/frontend/package.json', import.meta.url));
const server = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3002'],
  {
    cwd: workspace,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited: ${output}`);
    try {
      ready =
        (await fetch('http://127.0.0.1:3002/', { signal: AbortSignal.timeout(1000) })).status ===
        200;
    } catch {
      /* Wait for the production listener. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Production server did not start: ${output}`);
  const home = await fetch('http://127.0.0.1:3002/');
  const preview = await fetch('http://127.0.0.1:3002/modal-preview');
  const previewHtml = await preview.text();
  assert.equal(home.status, 200);
  assert.equal(preview.status, 404);
  assert.ok(!previewHtml.includes('EXAMPLE RANKINGS'));
  assert.ok(!previewHtml.includes('Example player 1'));
  const result = {
    mode: 'built production next start',
    node: process.version,
    home: home.status,
    modalPreview: preview.status,
    exampleRankingsExposed: false,
  };
  const artifacts = process.env.PUTTENTIAL_REVIEW_ARTIFACTS ?? 'artifacts/iteration-two';
  await mkdir(artifacts, { recursive: true });
  await writeFile(`${artifacts}/production-route-smoke.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  server.kill();
}
