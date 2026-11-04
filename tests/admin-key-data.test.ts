import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadServerModule } from './helpers/server-module';

type Data = typeof import('../lib/admin-key-data');
function setup(failTable = '') {
  const requests: URL[] = [];
  const row = { id: 'uuid-1', key_hash: 'a'.repeat(64), plan_type: 'bundle', status: 'available',
    license_id:null,license_status:null,buyer_email:null,device_id:null,activated_at:null };
  const issued = { id: 'uuid-2', key_hash: 'b'.repeat(64), plan_type: 'yearly', status: 'assigned',
    license_id: 'license-1', buyer_email: 'buyer@example.com', device_id: 'device-1',
      activated_at: '2026-10-04T00:00:00Z', license_status: 'active' };
  const revoked = { id: 'uuid-3', key_hash: 'c'.repeat(64), plan_type: 'semester', status: 'assigned',
    license_id: 'license-2', buyer_email: 'other@example.com', device_id: null,
      activated_at: null, license_status: 'revoked' };
  const db = createClient('https://example.supabase.co', 'test-service-key', {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      const table = url.pathname.split('/').at(-1)!;
      if (!['website_license_admin'].includes(table)) return new Response('{}', { status: 404 });
      if (table === failTable) return new Response(JSON.stringify({ message: 'private-db-error' }), { status: 400 });
      const plan = url.searchParams.get('plan_type');
      const status = url.searchParams.get('status');
      const count = plan && status ? 26 : plan ? ({ 'eq.bundle': 40, 'eq.semester': 20,
        'eq.yearly': 15, 'eq.internal_check': 5, 'eq.extension': 7 }[plan] ?? 0) : status === 'eq.available' ? 55 : status === 'eq.assigned' ? 22 : 87;
      return new Response(init?.method === 'HEAD' ? null : JSON.stringify(plan || status ? [row] : [row, issued, revoked]), {
        headers: { 'Content-Type': 'application/json', 'Content-Range': `0-0/${count}` },
      });
    } },
  });
  const shared = loadServerModule('lib/admin-key-options.ts', {});
  const data = loadServerModule<Data>('lib/admin-key-data.ts', {
    '@/lib/admin-key-options': shared, '@/lib/admin-auth':{requireAdminSession:async()=>{}}, '@/lib/canonical-commerce': { pricingDatabase: () => db },
  });
  return { data, requests };
}

test('filtered pages retain global summaries and expose hash prefixes only', async () => {
  const { data, requests } = setup();
  const result = await data.getAdminDashboardData({ plan: 'bundle', status: 'available', page: '999' });
  assert.equal(result.summary.total, 87);
  assert.equal(result.summary.available, 55);
  assert.equal(result.summary.redeemed, 22);
  assert.equal(result.summary.plans.bundle, 40);
  assert.equal(result.summary.plans.extension, 7);
  assert.equal(result.matchingCount, 26);
  assert.equal(result.page, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.keys[0].hashPrefix, 'aaaaaaaaaaaa');
  assert.equal('key_hash' in result.keys[0], false);
  const list = requests.find(url => url.searchParams.has('limit'))!;
  assert.equal(list.searchParams.get('offset'), '25');
  assert.equal(list.searchParams.get('limit'), '25');
  assert.equal(list.pathname, '/rest/v1/website_license_admin');
  assert.equal(list.searchParams.get('order'), 'id.desc');
  assert.equal(list.searchParams.get('select'), '*');
  const issuedCount = requests.find(url => url.searchParams.get('status')==='eq.assigned'&&!url.searchParams.has('limit'))!;
  assert.equal(issuedCount.searchParams.get('select'), 'id');
  assert.equal(issuedCount.searchParams.get('status'), 'eq.assigned');
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
  for (const table of ['website_license_admin']) {
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
