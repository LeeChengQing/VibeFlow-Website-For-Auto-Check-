import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServerModule } from './helpers/server-module';

type Admin = typeof import('../lib/supabase/admin');

function setup(authorized = true) {
  const env: Record<string, string | undefined> = {
    NODE_ENV: 'production', SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key',
  };
  const requests: { url: string; headers: Headers; cache: RequestCache | undefined }[] = [];
  const admin = loadServerModule<Admin>('lib/supabase/admin.ts', {
    '@/lib/admin-auth': { requireAdminSession: async () => {
      if (!authorized) throw new Error('UNAUTHORIZED');
      return { issuedAt: 1, expiresAt: 28_801 };
    } },
  }, {
    process: { env },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers), cache: init?.cache });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  return { admin, env, requests };
}

test('service-role data requests are authorized and uncached', async () => {
  const { admin, requests } = setup();
  const db = await admin.getSupabaseAdmin();
  const result = await db.from('key_inventory').select('id');
  assert.equal(result.error, null);
  assert.deepEqual(result.data, []);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^https:\/\/project.supabase.co\/rest\/v1\/key_inventory/);
  assert.equal(requests[0].headers.get('apikey'), 'test-service-role-key');
  assert.equal(requests[0].headers.get('authorization'), 'Bearer test-service-role-key');
  assert.equal(requests[0].cache, 'no-store');
  assert.equal((await db.auth.getSession()).data.session, null);
});

test('unauthorized callers cannot obtain a privileged client', async () => {
  const { admin, requests } = setup(false);
  await assert.rejects(admin.getSupabaseAdmin(), /UNAUTHORIZED/);
  assert.equal(requests.length, 0);
});

test('missing service-role credentials never fall back to a public key', async () => {
  for (const [variable, value] of [
    ['SUPABASE_SERVICE_ROLE_KEY', undefined], ['SUPABASE_SERVICE_ROLE_KEY', '  '],
    ['SUPABASE_URL', undefined], ['SUPABASE_URL', 'invalid'],
    ['SUPABASE_URL', 'http://project.supabase.co'],
    ['SUPABASE_URL', 'https://user:password@project.supabase.co'],
  ] as const) {
    const { admin, env, requests } = setup();
    env[variable] = value;
    await assert.rejects(admin.getSupabaseAdmin(), /SUPABASE_ADMIN_NOT_CONFIGURED/);
    assert.equal(requests.length, 0);
  }
});
