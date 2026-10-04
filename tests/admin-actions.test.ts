import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServerModule } from './helpers/server-module';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

type Actions = typeof import('../app/admin/actions');
function setup(options: { authorized?: boolean; dbError?: boolean; passwordValid?: boolean; unavailable?: boolean } = {}) {
  const batches: Record<string, unknown>[][] = [];
  const events: string[] = [];
  const keys = loadServerModule<typeof import('../lib/admin-keys')>('lib/admin-keys.ts', {});
  const shared = loadServerModule('lib/admin-key-options.ts', {});
  const actions = loadServerModule<Actions>('app/admin/actions.ts', {
    '@/lib/admin-key-options': shared,
    '@/lib/admin-keys': keys,
    '@/lib/admin-auth': {
      verifyAdminPassword: async () => {
        if (options.unavailable) throw new Error('sensitive configuration detail');
        return options.passwordValid ?? true;
      },
      createAdminSession: async () => { events.push('session'); },
      deleteAdminSession: async () => { events.push('logout'); },
      requireAdminSession: async () => { if (options.authorized === false) throw new Error('UNAUTHORIZED'); },
    },
    '@/lib/supabase/admin': { getSupabaseAdmin: async () => ({ from: (table: string) => {
      assert.equal(table, 'key_inventory');
      return { insert: async (rows: Record<string, unknown>[]) => {
        batches.push(rows);
        return { error: options.dbError ? { message: 'database-private-detail' } : null };
      } };
    } }) },
    'next/cache': { revalidatePath: (path: string) => { events.push(`revalidate:${path}`); } },
    'next/navigation': { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
  });
  return { actions, batches, events, keys };
}

test('login creates a session then redirects; generic failures create no session', async () => {
  const success = setup();
  await assert.rejects(success.actions.loginAction('password'), /REDIRECT:\/admin/);
  assert.deepEqual(success.events, ['session']);
  for (const options of [{ passwordValid: false }, { unavailable: true }]) {
    const denied = setup(options);
    const result = await denied.actions.loginAction('password');
    assert.ok(result.error);
    assert.doesNotMatch(result.error, /sensitive/);
    assert.deepEqual(denied.events, []);
  }
});

test('logout clears the cookie and redirects even with an expired session', async () => {
  const { actions, events } = setup({ authorized: false });
  await assert.rejects(actions.logoutAction(), /REDIRECT:\/admin/);
  assert.deepEqual(events, ['logout']);
});

test('unauthorized or invalid provisioning never inserts or returns codes', async () => {
  const denied = setup({ authorized: false });
  assert.ok(!Array.isArray(await denied.actions.generateKeysAction('bundle', 1)));
  assert.equal(denied.batches.length, 0);
  const { actions, batches, events } = setup();
  for (const plan of ['invalid', '__proto__', 'constructor', 'BUNDLE', '']) {
    assert.ok(!Array.isArray(await actions.generateKeysAction(plan, 1)));
  }
  for (const count of [0, -1, 101, 1.5, NaN, Infinity, '2', null]) {
    assert.ok(!Array.isArray(await actions.generateKeysAction('bundle', count as number)));
  }
  assert.equal(batches.length, 0);
  assert.deepEqual(events, []);
});

test('one batch insert persists only hashes and returns plaintext after success', async () => {
  const { actions, batches, events, keys } = setup();
  for (const plan of ['bundle', 'semester', 'yearly', 'internal_check']) {
    const result = await actions.generateKeysAction(plan, 100);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 100);
    const batch = batches.at(-1)!;
    assert.equal(batch.length, 100);
    batch.forEach((row, index) => {
      assert.deepEqual(Object.keys(row).sort(), ['key_hash', 'plan_type', 'status']);
      assert.equal(row.key_hash, keys.hashActivationCode(result[index]));
      assert.equal(row.plan_type, plan);
      assert.equal(row.status, 'available');
    });
  }
  assert.equal(batches.length, 4);
  assert.equal(events.length, 4);
  assert.ok(events.every(event => event === 'revalidate:/admin'));
});

test('failed inserts expose a safe error and no plaintext', async () => {
  const { actions, events } = setup({ dbError: true });
  const result = await actions.generateKeysAction('bundle', 5);
  assert.ok(!Array.isArray(result));
  assert.ok(result.error);
  assert.doesNotMatch(JSON.stringify(result), /database-private-detail|AC-/);
  assert.deepEqual(events, []);
});

test('multi-row insertion is atomic when one key violates a constraint', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_activation_keys.sql'))!;
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    const commerce = readdirSync('supabase/migrations').find(name => name.endsWith('_commerce_and_inventory.sql'))!;
    await db.exec(readFileSync(`supabase/migrations/${commerce}`, 'utf8'));
    await assert.rejects(db.query(`insert into public.key_inventory (key_hash, plan_type)
      values ($1, 'bundle'), ($2, 'bundle')`, ['a'.repeat(64), 'invalid']), /check constraint/);
    assert.equal((await db.query('select * from public.key_inventory')).rows.length, 0);
  } finally { await db.close(); }
});
