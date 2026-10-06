import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadServerModule } from './helpers/server-module';

const encryption = loadServerModule<any>('lib/license-key-encryption.ts', {});
const worker = loadServerModule<any>('lib/outbox/worker.ts', {
  '@/lib/license-key-encryption': encryption,
});
const { processOutboxBatch, MockEmailAdapter } = worker;
const { encryptLicenseKey } = encryption;

import { retryOrderFulfillment, recordInventoryExhaustion } from '@/lib/fulfillment/fulfillment-service';

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

test('inventory exhaustion alerting, outbox drain, restock, and fulfillment retry', async () => {
  const db = new PGlite();
  await migrateAll(db);

  process.env.LICENSE_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

  // 1. Create paid order with no available inventory in stock
  const orderId = '00000000-0000-4000-8000-000000000099';
  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_payment_id, status
    ) values (
      $1, 'VF-STOCK-001', 'buyer@school.edu.my', 'extension', 'MYR', 3900,
      'stripe', 'pi_test_123', 'pending'
    )
  `, [orderId]);

  // Record exhaustion
  await recordInventoryExhaustion(db, orderId);

  // Check order has fulfillment_error = 'INVENTORY_EXHAUSTED'
  const orderRow = (await db.query<any>(`select fulfillment_error from public.orders where id = $1`, [orderId])).rows[0];
  assert.equal(orderRow.fulfillment_error, 'INVENTORY_EXHAUSTED');

  // Check outbox has inventory_exhausted_alert task
  const outboxRows = (await db.query<any>(`select * from public.order_outbox where order_id = $1`, [orderId])).rows;
  assert.equal(outboxRows.length, 1);
  assert.equal(outboxRows[0].event_type, 'inventory_exhausted_alert');

  // Drain outbox with mock email adapter
  const mockAdapter = new MockEmailAdapter();
  const alertResult = await processOutboxBatch(db, { emailAdapter: mockAdapter });
  assert.equal(alertResult.succeeded, 1);
  assert.equal(mockAdapter.sentAlerts.length, 1);
  assert.equal(mockAdapter.sentAlerts[0].level, 'critical');
  assert.ok(mockAdapter.sentAlerts[0].title.includes('库存耗尽'));

  // Retrying while still empty throws INVENTORY_EXHAUSTED
  await assert.rejects(
    async () => retryOrderFulfillment(db, orderId),
    /INVENTORY_EXHAUSTED/
  );

  // 2. Restock: add a key for extension (core)
  const plainKey = 'CORE-RESTOCKED-ABC';
  const keyHash = 'c'.repeat(64);
  const encrypted = encryptLicenseKey(plainKey, keyHash);
  await db.query(`
    insert into public.key_inventory (
      id, key_hash, plan_type, status, encrypted_key
    ) values (
      '00000000-0000-4000-8000-000000000088', $1, 'core', 'available', $2
    )
  `, [keyHash, encrypted]);

  // 3. Retry fulfillment now succeeds
  const retryResult = await retryOrderFulfillment(db, orderId);
  assert.ok(retryResult.licenseId);

  // Check order is paid and fulfillment_error is cleared
  const updatedOrder = (await db.query<any>(`select status, fulfillment_error from public.orders where id = $1`, [orderId])).rows[0];
  assert.equal(updatedOrder.status, 'paid');
  assert.equal(updatedOrder.fulfillment_error, null);

  // Check outbox now has fulfillment email task
  const newOutboxTasks = (await db.query<any>(`
    select * from public.order_outbox
    where order_id = $1 and event_type = 'order_fulfillment_email'
  `, [orderId])).rows;
  assert.equal(newOutboxTasks.length, 1);

  // Drain fulfillment email
  const fulfillmentBatch = await processOutboxBatch(db, { emailAdapter: mockAdapter });
  assert.equal(fulfillmentBatch.succeeded, 1);
  assert.equal(mockAdapter.sentFulfillments.length, 1);
  assert.equal(mockAdapter.sentFulfillments[0].to, 'buyer@school.edu.my');
  assert.equal(mockAdapter.sentFulfillments[0].licenseKey, plainKey);
});
