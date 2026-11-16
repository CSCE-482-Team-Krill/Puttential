import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

test('community leaderboard migration backfills existing maps and preserves daily progress', async () => {
  const connection = process.env.TEST_DATABASE_URL;
  if (!connection) throw new Error('Set TEST_DATABASE_URL to a disposable local test database.');
  const target = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/test/.test(target.pathname))
    throw new Error('Migration checks require an explicitly named local test database.');
  const client = new Client({ connectionString: connection });
  await client.connect();
  try {
    await client.query('BEGIN');
    const schema = `leaderboard_migration_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    for (const name of [
      '20260923081242_init',
      '20260928235319_anonymous_user',
      '20261026000000_competitive_daily',
      '20261109000000_community_maps',
    ])
      await client.query(
        await readFile(
          new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
          'utf8',
        ),
      );
    await client.query(`
      INSERT INTO guests (id, session_hash, nickname, expires_at) VALUES ('guest', 'hash', 'Player', NOW() + interval '1 day');
      INSERT INTO puzzles (puzzle_id, date, seed, configuration, difficulty, rules)
      VALUES ('daily', '2026-11-12', 'seed', '{}', 1, '{}');
      INSERT INTO guest_progress (guest_id, puzzle_id, attempts_started, first_solve_attempts, best_daily)
      VALUES ('guest', 'daily', 2, 2, '{"runId":"existing-daily-best"}');
      INSERT INTO community_maps (id, author_id, request_id, submission_hash, title, description, creator_name, configuration, rules, author_solution)
      VALUES ('community', 'guest', 'request', 'hash', 'Existing map', '', 'Player', '{"id":"original"}', '{"maxTicks":120}', '{"commands":[]}');
    `);
    const before = (await client.query('SELECT * FROM guest_progress')).rows;
    await client.query(
      await readFile(
        new URL(
          '../prisma/migrations/20261112000000_community_leaderboards/migration.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    assert.deepEqual((await client.query('SELECT * FROM guest_progress')).rows, before);
    const {
      rows: [course],
    } = await client.query(`SELECT * FROM puzzles WHERE community_map_id = 'community'`);
    assert.equal(course.puzzle_id, 'community');
    assert.equal(course.date, null);
    assert.equal(course.title, 'Existing map');
    assert.deepEqual(course.configuration, { id: 'original' });
    assert.deepEqual(course.rules, { maxTicks: 120 });
    assert.deepEqual(course.author_solution, { commands: [] });
    assert.equal(
      (await client.query('SELECT count(*) FROM puzzles WHERE date IS NOT NULL')).rows[0].count,
      '1',
    );
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
