import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadServerModule } from './helpers/server-module';

type Data = typeof import('../lib/admin-key-data');
function setup(failTable = '') {
  const requests: URL[] = [];
  const row = { id: 'uuid-1', key_hash: 'a'.repeat(64), plan_type: 'bundle', status: 'available',
    issued_licenses: null };
  const issued = { id: 'uuid-2', key_hash: 'b'.repeat(64), plan_type: 'yearly', status: 'assigned',
    issued_licenses: { id: 'license-1', buyer_email: 'buyer@example.com', device_id: 'device-1',
      activated_at: '2026-10-04T00:00:00Z', status: 'active' } };
  const revoked = { id: 'uuid-3', key_hash: 'c'.repeat(64), plan_type: 'semester', status: 'assigned',
    issued_licenses: { id: 'license-2', buyer_email: 'other@example.com', device_id: null,
      activated_at: null, status: 'revoked' } };
  const db = createClient('https://example.supabase.co', 'test-service-key', {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      const table = url.pathname.split('/').at(-1)!;
      if (!['key_inventory', 'issued_licenses'].includes(table)) return new Response('{}', { status: 404 });
      if (table === failTable) return new Response(JSON.stringify({ message: 'private-db-error' }), { status: 400 });
      const plan = url.searchParams.get('plan_type');
      const status = url.searchParams.get('status');
      const count = table === 'issued_licenses' ? 22 : plan && status ? 26 : plan ? ({ 'eq.bundle': 40, 'eq.semester': 20,
        'eq.yearly': 15, 'eq.internal_check': 5 }[plan] ?? 0) : status === 'eq.available' ? 55 : 80;
      return new Response(init?.method === 'HEAD' ? null : JSON.stringify(plan || status ? [row] : [row, issued, revoked]), {
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
  assert.equal(list.pathname, '/rest/v1/key_inventory');
  assert.equal(list.searchParams.get('order'), 'id.desc');
  assert.equal(list.searchParams.get('select'), 'id,key_hash,plan_type,status,issued_licenses(id,buyer_email,device_id,activated_at,status)');
  const issuedCount = requests.find(url => url.pathname.endsWith('/issued_licenses'))!;
  assert.equal(issuedCount.searchParams.get('select'), 'id');
  assert.equal(issuedCount.searchParams.has('status'), false);
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
  for (const table of ['key_inventory', 'issued_licenses']) {
    const { data } = setup(table);
    await assert.rejects(data.getAdminDashboardData({}), /ADMIN_DATA_UNAVAILABLE/);
  }
});

test('left-joined inventory preserves unissued stock and flattens active and revoked license metadata without exposing hashes', async () => {
  const { data } = setup();
  const result = await data.getAdminDashboardData({});
  assert.deepEqual(JSON.parse(JSON.stringify(result.keys)), [
    { id: 'uuid-1', hashPrefix: 'aaaaaaaaaaaa', plan_type: 'bundle', status: 'available',
      license_id: null, license_status: null, buyer_email: null, device_id: null, activated_at: null },
    { id: 'uuid-2', hashPrefix: 'bbbbbbbbbbbb', plan_type: 'yearly', status: 'assigned',
      license_id: 'license-1', license_status: 'active', buyer_email: 'buyer@example.com',
      device_id: 'device-1', activated_at: '2026-10-04T00:00:00Z' },
    { id: 'uuid-3', hashPrefix: 'cccccccccccc', plan_type: 'semester', status: 'assigned',
      license_id: 'license-2', license_status: 'revoked', buyer_email: 'other@example.com',
      device_id: null, activated_at: null },
  ]);
  assert.ok(!JSON.stringify(result).includes('a'.repeat(64)));
});

test('assigned filters apply to inventory rather than license status', async () => {
  const { data, requests } = setup();
  const result = await data.getAdminDashboardData({ status: 'assigned' });
  assert.equal(result.status, 'assigned');
  assert.equal(requests.find(url => url.searchParams.has('limit'))!.searchParams.get('status'), 'eq.assigned');
});
