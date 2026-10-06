import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { runDailyReconciliation } from '../lib/ops/reconcile';
import { sendAdminAlert, resetAlertThrottle } from '../lib/ops/admin-alert';

async function migrateAll(db: PGlite) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on tables to public, anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
  `);

  const migrationFiles = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    await db.exec(sql);
  }
}

test('Stage I: Daily reconciliation identifies healthy state when all orders and licenses match', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // Setup healthy inventory (10 keys of core)
  for (let i = 0; i < 10; i++) {
    await db.exec(`
      insert into public.key_inventory (key_hash, plan_type, status, encrypted_key, hash_version)
      values ('hash-healthy-core-000000000000000${i}', 'core', 'available', 'enc-test', 2);
    `);
  }

  const report = await runDailyReconciliation(db, { lowStockThreshold: 5, trackedPlans: ['core'] });

  assert.equal(report.status, 'HEALTHY');
  assert.equal(report.anomalies.length, 0);
  assert.equal(report.stockByPlan['core'], 10);
});

test('Stage I: Daily reconciliation detects paid orders missing fulfillment and low stock', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const stuckOrderId = '00000000-0000-4000-8000-000000000099';

  // 1. Stuck paid order without license
  await db.exec(`
    insert into public.orders (
      id, reference, buyer_email, plan, amount_minor, currency, status, payment_provider, provider_payment_id, payment_confirmed_at
    ) values (
      '${stuckOrderId}', 'ORD-STUCK-1', 'stuck@example.com', 'core', 3500, 'MYR', 'paid', 'stripe', 'pi_test_stuck_001', now()
    );
  `);

  // Low stock: only 2 available keys
  await db.exec(`
    insert into public.key_inventory (key_hash, plan_type, status, encrypted_key, hash_version)
    values ('hash-low-core-0000000000000001', 'core', 'available', 'enc-1', 2),
           ('hash-low-core-0000000000000002', 'core', 'available', 'enc-2', 2);
  `);

  const report = await runDailyReconciliation(db, { lowStockThreshold: 5 });

  assert.notEqual(report.status, 'HEALTHY');
  assert.ok(report.anomalies.some(a => a.type === 'PAID_ORDER_UNFULFILLED' && a.id === stuckOrderId));
  assert.ok(report.anomalies.some(a => a.type === 'LOW_STOCK_WARNING' && a.plan === 'core'));
});

test('Stage I: Admin alert dispatcher throttles rapid duplicate alerts and formats priority', async () => {
  resetAlertThrottle();

  let sentPayloads: any[] = [];
  const mockFetch: typeof fetch = async (url, init) => {
    sentPayloads.push({
      url: String(url),
      headers: init?.headers,
      body: String(init?.body),
    });
    return new Response('OK', { status: 200 });
  };

  // 1. First alert sent
  const res1 = await sendAdminAlert({
    severity: 'critical',
    title: 'Database Outage Alert',
    message: 'Primary DB unresponsive',
    fetchFn: mockFetch,
    adminTopic: 'admin_test_topic_xyz',
  });
  assert.equal(res1.sent, true);
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].headers['Priority'], '5');

  // 2. Immediate duplicate alert with same title/message within cooldown -> THROTTLED
  const res2 = await sendAdminAlert({
    severity: 'critical',
    title: 'Database Outage Alert',
    message: 'Primary DB unresponsive',
    fetchFn: mockFetch,
    adminTopic: 'admin_test_topic_xyz',
  });
  assert.equal(res2.sent, false);
  assert.equal(res2.reason, 'THROTTLED');
  assert.equal(sentPayloads.length, 1, 'Duplicate must not dispatch external HTTP request');

  // 3. Different alert sent
  const res3 = await sendAdminAlert({
    severity: 'warn',
    title: 'Low Stock Alert',
    message: 'Core keys low',
    fetchFn: mockFetch,
    adminTopic: 'admin_test_topic_xyz',
  });
  assert.equal(res3.sent, true);
  assert.equal(sentPayloads.length, 2);
  assert.equal(sentPayloads[1].headers['Priority'], '4');
});
