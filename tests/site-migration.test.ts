import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { DEFAULT_SITE_CONFIG } from '../lib/site-config';

test('site migration denies browser roles and atomically publishes/restores/audits with stale-write protection', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role;
      create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
    await db.exec(readFileSync('supabase/migrations/20261003162918_activation_keys.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261003182731_site_management.sql', 'utf8'));
    const { rows } = await db.query<{ published: unknown }>('select published from public.site_configuration');
    assert.deepEqual(rows[0].published, DEFAULT_SITE_CONFIG);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const table of ['site_configuration', 'site_revisions', 'site_activity', 'site_assets', 'site_uploads']) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
      await assert.rejects(db.query("select public.manage_site_configuration('publish',null,0,'test',null)"), /permission denied/);
      await assert.rejects(db.query("select public.revoke_activation_key('00000000-0000-4000-8000-000000000000')"), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const changed = structuredClone(DEFAULT_SITE_CONFIG); changed.packages[0].amount = 4100;
    await db.query("select public.manage_site_configuration('save',$1,0,'',null)", [changed]);
    assert.equal((await db.query<{ published: typeof changed }>('select published from public.site_configuration')).rows[0].published.packages[0].amount, 3500);
    await assert.rejects(db.query("select public.manage_site_configuration('publish',null,0,'stale',null)"), /VERSION_CONFLICT/);
    await assert.rejects(db.query("select public.manage_site_configuration('publish',null,1,$1,null)", ['x'.repeat(301)]), /INVALID_NOTE/);
    assert.equal((await db.query<{ count: number }>('select count(*)::int as count from public.site_revisions')).rows[0].count, 1);
    await db.query("select public.manage_site_configuration('publish',null,1,'New price',null)");
    assert.equal((await db.query<{ published: typeof changed }>('select published from public.site_configuration')).rows[0].published.packages[0].amount, 4100);
    const original = (await db.query<{ id: string }>('select id from public.site_revisions where version=0')).rows[0].id;
    await db.query("select public.manage_site_configuration('restore',null,2,'',$1)", [original]);
    const state = (await db.query<{ draft: typeof changed; published: typeof changed }>('select draft,published from public.site_configuration')).rows[0];
    assert.equal(state.draft.packages[0].amount, 3500); assert.equal(state.published.packages[0].amount, 4100);
    await assert.rejects(db.query('delete from public.site_revisions'), /permission denied/);
    const key = (await db.query<{ id: string }>("insert into public.activation_keys (key_hash,plan_type) values ($1,'bundle') returning id", ['a'.repeat(64)])).rows[0].id;
    await db.query('select public.revoke_activation_key($1)', [key]);
    assert.equal((await db.query<{ status: string }>('select status from public.activation_keys where id=$1', [key])).rows[0].status, 'revoked');
    assert.equal((await db.query<{ count: number }>('select count(*)::int as count from public.site_activity')).rows[0].count, 4);
    await assert.rejects(db.query('select public.revoke_activation_key($1)', [key]), /KEY_NOT_AVAILABLE/);
  } finally { await db.close(); }
});
