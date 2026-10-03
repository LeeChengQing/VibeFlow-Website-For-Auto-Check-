import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadServerModule } from './helpers/server-module';

type Data = typeof import('../lib/admin-key-data');
function setup(fail = false) {
  const requests: URL[] = [];
  const row = { id: 'uuid-1', key_hash: 'a'.repeat(64), plan_type: 'bundle', status: 'available',
    buyer_email: null, device_id: null, created_at: '2026-10-04T00:00:00Z', redeemed_at: null };
  const db = createClient('https://example.supabase.co', 'test-service-key', {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      if (fail) return new Response(JSON.stringify({ message: 'private-db-error' }), { status: 500 });
      const plan = url.searchParams.get('plan_type');
      const status = url.searchParams.get('status');
      const count = plan && status ? 26 : plan ? ({ 'eq.bundle': 40, 'eq.semester': 20,
        'eq.yearly': 15, 'eq.internal_check': 5 }[plan] ?? 0) : status === 'eq.available' ? 55 : status === 'eq.redeemed' ? 22 : 80;
      return new Response(init?.method === 'HEAD' ? null : JSON.stringify([row]), {
        headers: { 'Content-Type': 'application/json', 'Content-Range': `0-0/${count}` },
      });
    } },
  });
  const shared = loadServerModule('lib/admin-key-options.ts', {});
  const data = loadServerModule<Data>('lib/admin-key-data.ts', {
    '@/lib/admin-key-options': shared, '@/lib/supabase/admin': { getSupabaseAdmin: async () => db },
  });
  return { data, requests };
}

test('filtered pages retain global summaries and expose hash prefixes only', async () => {
  const { data, requests } = setup();
  const result = await data.getAdminDashboardData({ plan: 'bundle', status: 'available', page: '999' });
  assert.equal(result.summary.total, 80);
  assert.equal(result.summary.available, 55);
  assert.equal(result.summary.redeemed, 22);
  assert.equal(result.summary.plans.bundle, 40);
  assert.equal(result.matchingCount, 26);
  assert.equal(result.page, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.keys[0].hashPrefix, 'aaaaaaaaaaaa');
  assert.equal('key_hash' in result.keys[0], false);
  const list = requests.find(url => url.searchParams.has('limit'))!;
  assert.equal(list.searchParams.get('offset'), '25');
  assert.equal(list.searchParams.get('limit'), '25');
  assert.equal(list.searchParams.get('order'), 'created_at.desc,id.desc');
});

test('malformed query values never reach database filters or unbounded offsets', async () => {
  for (const page of ['-1', '1.5', 'Infinity', '1e9', ['2']]) {
    const { data, requests } = setup();
    const result = await data.getAdminDashboardData({ plan: '__proto__', status: ['available'], page });
    assert.equal(result.page, 1);
    assert.equal(result.plan, '');
    assert.equal(result.status, '');
    const list = requests.find(url => url.searchParams.has('limit'))!;
    assert.equal(list.searchParams.has('plan_type'), false);
    assert.equal(list.searchParams.has('status'), false);
    assert.ok(requests.every(url => ![...url.searchParams.values()].some(value => value.includes('__proto__'))));
  }
});

test('database read failures expose only a safe error', async () => {
  const { data } = setup(true);
  await assert.rejects(data.getAdminDashboardData({}), /ADMIN_DATA_UNAVAILABLE/);
});
