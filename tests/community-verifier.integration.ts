import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

// Real SQL/LOGIN feasibility, deliberately isolated from the future production schema.
// This does not prove TLS/SCRAM or the selected VM's process/DB boundary.
test('real PostgreSQL role denial, reserved-unit concurrency and fenced confirmed release', async () => {
  const connection = process.env.TEST_DATABASE_URL;
  if (!connection) throw new Error('Set TEST_DATABASE_URL to a disposable local test database.');
  const target = new URL(connection);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/test|iteration_two/.test(target.pathname)
  )
    throw new Error('Verifier feasibility requires an explicitly named local test database.');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const schema = `community_probe_${suffix}`;
  const owner = `${schema}_owner`,
    web = `${schema}_web`,
    runner = `${schema}_runner`,
    execution = `${schema}_exec`;
  const admin = new Client({ connectionString: connection });
  const clients: Client[] = [];
  await admin.connect();
  const generation = randomUUID();
  const asRole = async (role: string) => {
    const url = new URL(connection);
    url.username = role;
    url.password = 'local-feasibility-only';
    const client = new Client({ connectionString: url.href });
    await client.connect();
    clients.push(client);
    assert.equal((await client.query('SELECT current_user AS role')).rows[0].role, role);
    return client;
  };
  try {
    await admin.query(`
      CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      CREATE ROLE ${execution} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      CREATE ROLE ${web} LOGIN PASSWORD 'local-feasibility-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      CREATE ROLE ${runner} LOGIN PASSWORD 'local-feasibility-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT ${execution} TO ${runner};
      CREATE SCHEMA ${schema} AUTHORIZATION ${owner};
      SET ROLE ${owner};
      CREATE TABLE ${schema}.control (id integer PRIMARY KEY CHECK(id=1), generation uuid NOT NULL);
      INSERT INTO ${schema}.control VALUES (1, '${generation}');
      CREATE TABLE ${schema}.candidate_inputs (id uuid PRIMARY KEY, payload jsonb NOT NULL);
      CREATE TABLE ${schema}.accepted_versions (job_id uuid PRIMARY KEY, evidence jsonb NOT NULL);
      CREATE TABLE ${schema}.community_jobs (
        id uuid PRIMARY KEY, state text NOT NULL DEFAULT 'queued', runner_generation uuid,
        unit_number integer, attempt_fence uuid, reservation_acquired_at timestamptz,
        reservation_held boolean NOT NULL DEFAULT false,
        CHECK (reservation_held IS FALSE OR (
          runner_generation IS NOT NULL AND unit_number IS NOT NULL AND unit_number IN (0,1)
          AND attempt_fence IS NOT NULL AND reservation_acquired_at IS NOT NULL))
      );
      CREATE UNIQUE INDEX community_job_reserved_unit_uq
        ON ${schema}.community_jobs (runner_generation, unit_number)
        WHERE reservation_held IS TRUE;
      CREATE FUNCTION ${schema}.claim_probe(job uuid, generation uuid, unit integer) RETURNS uuid
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE fence uuid;
        BEGIN
          IF generation IS DISTINCT FROM (SELECT c.generation FROM ${schema}.control c WHERE id=1) OR unit NOT IN(0,1)
            THEN RAISE EXCEPTION 'Stale generation or invalid unit'; END IF;
          UPDATE ${schema}.community_jobs SET state='running', runner_generation=generation,
            unit_number=unit, attempt_fence=gen_random_uuid(), reservation_acquired_at=clock_timestamp(), reservation_held=true
            WHERE id=job AND state='queued' AND reservation_held=false RETURNING attempt_fence INTO fence;
          IF fence IS NULL THEN RAISE EXCEPTION 'Job unavailable'; END IF;
          RETURN fence;
        END $$;
      CREATE FUNCTION ${schema}.finish_probe(job uuid, generation uuid, fence uuid, confirmed_exit boolean) RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        BEGIN
          IF confirmed_exit IS DISTINCT FROM true OR generation IS DISTINCT FROM
            (SELECT c.generation FROM ${schema}.control c WHERE id=1) THEN RAISE EXCEPTION 'Unconfirmed exit or stale generation'; END IF;
          UPDATE ${schema}.community_jobs SET reservation_held=false, state='terminal'
            WHERE id=job AND runner_generation=generation AND attempt_fence=fence AND reservation_held=true;
          IF NOT FOUND THEN RAISE EXCEPTION 'Stale fence'; END IF;
        END $$;
      REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${schema} FROM PUBLIC;
      GRANT USAGE ON SCHEMA ${schema} TO ${web}, ${execution};
      GRANT EXECUTE ON FUNCTION ${schema}.claim_probe(uuid,uuid,integer), ${schema}.finish_probe(uuid,uuid,uuid,boolean) TO ${execution};
      RESET ROLE;
    `);
    const webClient = await asRole(web),
      runnerA = await asRole(runner),
      runnerB = await asRole(runner);
    const denied = async (client: Client, sql: string, parameters: unknown[] = []) =>
      assert.rejects(
        client.query(sql, parameters),
        (error: { code: string }) => error.code === '42501',
      );
    await denied(webClient, `INSERT INTO ${schema}.accepted_versions VALUES ($1, '{}')`, [
      randomUUID(),
    ]);
    await denied(webClient, `INSERT INTO ${schema}.candidate_inputs VALUES ($1, '{}')`, [
      randomUUID(),
    ]);
    await denied(webClient, `UPDATE ${schema}.candidate_inputs SET payload='{}'`);
    await denied(webClient, `SELECT ${schema}.claim_probe($1,$2,0)`, [randomUUID(), generation]);
    await denied(webClient, `SELECT ${schema}.finish_probe($1,$2,$3,true)`, [
      randomUUID(),
      generation,
      randomUUID(),
    ]);
    await denied(runnerA, `INSERT INTO ${schema}.accepted_versions VALUES ($1, '{}')`, [
      randomUUID(),
    ]);
    await denied(runnerA, `UPDATE ${schema}.control SET generation=$1`, [randomUUID()]);
    const ids = [randomUUID(), randomUUID()];
    await admin.query(`INSERT INTO ${schema}.community_jobs(id) VALUES ($1), ($2)`, ids);
    const claims = await Promise.allSettled([
      runnerA.query(`SELECT ${schema}.claim_probe($1,$2,0) AS fence`, [ids[0], generation]),
      runnerB.query(`SELECT ${schema}.claim_probe($1,$2,0) AS fence`, [ids[1], generation]),
    ]);
    assert.equal(claims.filter((claim) => claim.status === 'fulfilled').length, 1);
    const rejected = claims.find((claim) => claim.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code, '23505');
    const rows = (await admin.query(`SELECT * FROM ${schema}.community_jobs ORDER BY id`)).rows;
    const held = rows.find((row) => row.reservation_held),
      queued = rows.find((row) => !row.reservation_held);
    assert.equal(held.unit_number, 0);
    // User-facing terminal/cancel state does not free physical capacity.
    await admin.query(`UPDATE ${schema}.community_jobs SET state='terminal' WHERE id=$1`, [
      held.id,
    ]);
    await assert.rejects(
      runnerB.query(`SELECT ${schema}.claim_probe($1,$2,0)`, [queued.id, generation]),
      (error: { code: string }) => error.code === '23505',
    );
    await assert.rejects(
      runnerA.query(`SELECT ${schema}.finish_probe($1,$2,$3,false)`, [
        held.id,
        generation,
        held.attempt_fence,
      ]),
      /Unconfirmed/,
    );
    await assert.rejects(
      runnerA.query(`SELECT ${schema}.finish_probe($1,$2,$3,true)`, [
        held.id,
        generation,
        randomUUID(),
      ]),
      /Stale fence/,
    );
    assert.equal(
      (
        await admin.query(`SELECT reservation_held FROM ${schema}.community_jobs WHERE id=$1`, [
          held.id,
        ])
      ).rows[0].reservation_held,
      true,
    );
    await runnerA.query(`SELECT ${schema}.finish_probe($1,$2,$3,true)`, [
      held.id,
      generation,
      held.attempt_fence,
    ]);
    await runnerB.query(`SELECT ${schema}.claim_probe($1,$2,0)`, [queued.id, generation]);
    const retained = (
      await admin.query(`SELECT * FROM ${schema}.community_jobs WHERE id=$1`, [held.id])
    ).rows[0];
    assert.equal(retained.reservation_held, false);
    assert.equal(retained.attempt_fence, held.attempt_fence);
    assert.equal(
      (
        await admin.query(
          `SELECT count(*)::integer AS n FROM ${schema}.community_jobs WHERE reservation_held`,
        )
      ).rows[0].n,
      1,
    );
    await admin.query(`UPDATE ${schema}.control SET generation=$1`, [randomUUID()]);
    await assert.rejects(
      runnerB.query(`SELECT ${schema}.claim_probe($1,$2,1)`, [randomUUID(), generation]),
      /Stale generation/,
    );
  } finally {
    for (const client of clients) await client.end();
    await admin.query('RESET ROLE');
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    for (const role of [runner, web, execution, owner]) {
      if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
        await admin.query(`DROP OWNED BY ${role}`);
        await admin.query(`DROP ROLE ${role}`);
      }
    }
    await admin.end();
  }
});
