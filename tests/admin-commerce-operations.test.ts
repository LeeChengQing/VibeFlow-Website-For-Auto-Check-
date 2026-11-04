import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServerModule } from './helpers/server-module';

const rows = [
  { id: '00000000-0000-4000-8000-000000000001', buyer_email: 'one@example.com', plan: 'extension', amount_minor: 1000, currency: 'MYR', status: 'paid', payment_provider: 'stripe', created_at: '2026-01-01', paid_at: '2026-01-02', refunded_at: null, refund_review: false, verification_only: false },
  { id: '00000000-0000-4000-8000-000000000002', buyer_email: 'two@example.com', plan: 'bundle', amount_minor: 2000, currency: 'MYR', status: 'pending', payment_provider: 'stripe', created_at: '2026-01-02', paid_at: null, refunded_at: null, refund_review: false, verification_only: false },
  { id: '00000000-0000-4000-8000-000000000003', buyer_email: 'three@example.com', plan: 'bundle', amount_minor: 3000, currency: 'MYR', status: 'refunded', payment_provider: 'stripe', created_at: '2026-01-03', paid_at: '2026-01-03', refunded_at: '2026-01-04', refund_review: false, verification_only: false },
  { id: '00000000-0000-4000-8000-000000000004', buyer_email: 'test@example.com', plan: 'extension', amount_minor: 9000, currency: 'MYR', status: 'paid', payment_provider: 'stripe', created_at: '2026-01-04', paid_at: '2026-01-04', refunded_at: null, refund_review: false, verification_only: true },
];
function setup(options: { authorized?: boolean; failure?: boolean } = {}) {
  let reads = 0;
  const db = { from(table: string) {
    assert.equal(table, 'payment_orders'); reads++;
    let filtered = [...rows];
    const query = {
      select(columns: string) { assert.doesNotMatch(columns, /token/); return query; },
      eq(key: string, value: string) { filtered = filtered.filter(row => row[key as keyof typeof row] === value); return query; },
      or(value: string) { const needle = value.split('%')[1].toLowerCase(); filtered = filtered.filter(row => row.buyer_email.includes(needle) || row.plan.includes(needle)); return query; },
      order() { return query; },
      async range(start: number, end: number) { return options.failure ? { data: null, count: null, error: { message: 'secret' } } : { data: filtered.slice(start, end + 1), count: filtered.length, error: null }; },
    };
    return query;
  } };
  const module = loadServerModule<typeof import('../lib/site-operations')>('lib/site-operations.ts', {
    '@/lib/admin-auth': { requireAdminSession: async () => { if (options.authorized === false) throw new Error('UNAUTHORIZED'); } },
    '@/lib/admin-local': { isLocalAdminPreview: async () => false },
    '@/lib/supabase/commerce': { isCommerceConfigured: () => true, getCommerceDatabase: () => db },
  });
  return { module, reads: () => reads };
}

test('production metrics exclude verification orders and refunded or pending amounts', async () => {
  const { module } = setup();
  const data = await module.getSiteOperations();
  assert.equal(data.source, 'production');
  assert.equal(data.support, 'unconfigured');
  assert.equal(data.metrics?.total, 3);
  assert.equal(data.metrics?.paid, 1);
  assert.equal(data.metrics?.pending, 1);
  assert.equal(data.metrics?.refunded, 1);
  assert.equal(data.metrics?.verification, 1);
  assert.equal(data.metrics?.revenue.MYR, 1000);
  assert.equal(data.productionPage?.orders[0].buyer_email, 'one@example.com');
});

test('production filtering and pagination run in the database query', async () => {
  const { module } = setup();
  const filtered = await module.getProductionOrders({ status: 'pending', search: 'two' });
  assert.equal(filtered.count, 1);
  assert.equal(filtered.orders[0].id, rows[1].id);
  const second = await module.getProductionOrders({ page: 2 });
  assert.equal(second.page, 2);
  assert.equal(second.orders.length, 0);
});

test('authorization precedes reads and production actions are disabled', async () => {
  const denied = setup({ authorized: false });
  await assert.rejects(denied.module.getProductionOrders(), /UNAUTHORIZED/);
  assert.equal(denied.reads(), 0);
  const { module } = setup();
  for (const action of ['refund', 'resend', 'generate_recovery_link']) await assert.rejects(module.runSiteOperation(action, rows[0].id), /LOCAL_ONLY/);
});

test('database errors remain distinct from empty order lists', async () => {
  const { module } = setup({ failure: true });
  await assert.rejects(module.getProductionOrders(), /ORDERS_UNAVAILABLE/);
  const result = await module.getSiteOperations();
  assert.match(result.error || '', /could not be loaded/);
  assert.doesNotMatch(result.error || '', /secret/);
});
