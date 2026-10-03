import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('activation key migration enforces inventory constraints and denies browser access', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to public, anon, authenticated, service_role;
    `);
    const filename = readdirSync('supabase/migrations').find(name => name.endsWith('_activation_keys.sql'));
    assert.ok(filename);
    await db.exec(readFileSync(`supabase/migrations/${filename}`, 'utf8'));
    const { rows: columns } = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'activation_keys'
    `);
    assert.ok(columns.some(column => column.column_name === 'key_hash'));
    assert.ok(!columns.some(column => /ciphertext|plaintext|key_code/.test(column.column_name)));
    const { rows: security } = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.activation_keys'::regclass
    `);
    assert.equal(security[0].relrowsecurity, true);
    assert.equal(security[0].relforcerowsecurity, true);
    const { rows: policies } = await db.query('select * from pg_policies where tablename = $1', ['activation_keys']);
    assert.equal(policies.length, 0);

    await db.exec('set role service_role');
    const hash = 'a'.repeat(64);
    await db.query('insert into public.activation_keys (key_hash, plan_type) values ($1, $2)', [hash, 'bundle']);
    for (const [plan, digest] of [['semester', 'b'], ['yearly', 'c'], ['internal_check', 'd']]) {
      await db.query('insert into public.activation_keys (key_hash, plan_type) values ($1, $2)', [digest.repeat(64), plan]);
    }
    await assert.rejects(db.query('insert into public.activation_keys (key_hash, plan_type) values ($1, $2)', [hash, 'bundle']), /unique/);
    await assert.rejects(db.query('insert into public.activation_keys (key_hash, plan_type) values ($1, $2)', ['e'.repeat(64), 'unknown']), /check constraint/);
    await assert.rejects(db.query('insert into public.activation_keys (key_hash, plan_type) values ($1, $2)', ['plaintext-code', 'bundle']), /check constraint/);
    await assert.rejects(db.query('update public.activation_keys set status = $1 where key_hash = $2', ['unknown', hash]), /check constraint/);
    await assert.rejects(db.query('update public.activation_keys set buyer_email = $1 where key_hash = $2', ['buyer@example.com', hash]), /check constraint/);
    await assert.rejects(db.query('update public.activation_keys set status = $1 where key_hash = $2', ['redeemed', hash]), /check constraint/);
    await db.query(`update public.activation_keys set status = 'redeemed', buyer_email = $1,
      device_id = 'device-1', redeemed_at = now() where key_hash = $2`, ['buyer@example.com', hash]);
    await db.query(`update public.activation_keys set status = 'revoked' where key_hash = $1`, [hash]);
    const { rows } = await db.query<{ status: string }>('select status from public.activation_keys where key_hash = $1', [hash]);
    assert.equal(rows[0].status, 'revoked');
    await db.exec('reset role');

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const query of [
        'select * from public.activation_keys',
        `insert into public.activation_keys (key_hash, plan_type) values ('${'f'.repeat(64)}', 'bundle')`,
        `update public.activation_keys set status = 'revoked'`,
        'delete from public.activation_keys',
        'truncate public.activation_keys',
      ]) await assert.rejects(db.exec(query), /permission denied/);
      await db.exec('reset role');
      // RLS still denies access if a future migration accidentally restores browser grants.
      await db.exec(`grant select, insert, update, delete on public.activation_keys to ${role}; set role ${role}`);
      assert.equal((await db.query('select * from public.activation_keys')).rows.length, 0);
      await assert.rejects(db.exec(`insert into public.activation_keys (key_hash, plan_type)
        values ('${'f'.repeat(64)}', 'bundle')`), /row-level security/);
      assert.equal((await db.query('delete from public.activation_keys returning id')).rows.length, 0);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await db.query('select * from public.activation_keys')).rows.length, 4);
    assert.equal((await db.query('delete from public.activation_keys returning id')).rows.length, 4);
  } finally {
    await db.close();
  }
});
