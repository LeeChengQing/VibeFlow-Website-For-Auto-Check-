import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

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

test('P0 commercial closure migration adds required tables, columns, and RPCs', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // 1. Check order columns
  const orderCols = (await db.query<{ column_name: string }>(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
  `)).rows.map(r => r.column_name);

  assert.ok(orderCols.includes('terms_version'));
  assert.ok(orderCols.includes('terms_accepted_at'));
  assert.ok(orderCols.includes('consent_ip_hash'));
  assert.ok(orderCols.includes('consent_ua'));
  assert.ok(orderCols.includes('order_access_token_hash'));
  assert.ok(orderCols.includes('release_asset_id'));

  // 2. Check outbox, refunds, support tables exist
  const tables = (await db.query<{ table_name: string }>(`
    select table_name from information_schema.tables
    where table_schema = 'public'
  `)).rows.map(r => r.table_name);

  assert.ok(tables.includes('order_outbox'));
  assert.ok(tables.includes('refunds'));
  assert.ok(tables.includes('disputes'));
  assert.ok(tables.includes('support_tickets'));
  assert.ok(tables.includes('support_messages'));
  assert.ok(tables.includes('audit_log'));
});

test('assign_available_key allocates core key for extension orders and enqueues outbox task', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // Add extension inventory key
  const keyHash = 'a'.repeat(64);
  await db.query(`
    insert into public.key_inventory (key_hash, plan_type, encrypted_key, status)
    values ($1, 'core', 'enc_core_key', 'available')
  `, [keyHash]);

  // Create extension order
  const orderRes = await db.query<{ id: string }>(`
    insert into public.orders (reference, buyer_email, plan, amount_minor, currency, payment_provider, status, terms_version, terms_accepted_at)
    values ('ORD-EXT-1', 'ext@example.com', 'extension', 2499, 'MYR', 'stripe', 'pending', '2026-10-06', now())
    returning id
  `);
  const orderId = orderRes.rows[0].id;

  // Run RPC
  const rpcRes = await db.query<{ assign_available_key: string }>(`
    select public.assign_available_key($1)
  `, [orderId]);
  const licenseId = rpcRes.rows[0].assign_available_key;

  assert.ok(licenseId, 'Expected issued license ID for extension plan');

  // Verify issued license exists
  const lic = (await db.query<{ buyer_email: string; plan_type: string; status: string }>(`
    select buyer_email, plan_type, status from public.issued_licenses where id = $1
  `, [licenseId])).rows[0];

  assert.equal(lic.buyer_email, 'ext@example.com');
  assert.equal(lic.status, 'active');

  // Verify order is paid
  const ord = (await db.query<{ status: string }>(`
    select status from public.orders where id = $1
  `, [orderId])).rows[0];
  assert.equal(ord.status, 'paid');

  // Verify outbox entry was created
  const outbox = (await db.query<{ event_type: string; status: string }>(`
    select event_type, status from public.order_outbox where order_id = $1
  `, [orderId])).rows;
  assert.ok(outbox.length > 0);
  assert.equal(outbox[0].event_type, 'order_fulfillment_email');
});

test('process_refund atomically refunds order, revokes license, marks key revoked, and queues outbox', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyHash = 'b'.repeat(64);
  const invRes = await db.query<{ id: string }>(`
    insert into public.key_inventory (key_hash, plan_type, encrypted_key, status)
    values ($1, 'semester', 'enc_semester_key', 'available')
    returning id
  `, [keyHash]);
  const invId = invRes.rows[0].id;

  const orderRes = await db.query<{ id: string }>(`
    insert into public.orders (reference, buyer_email, plan, amount_minor, currency, payment_provider, status, terms_version, terms_accepted_at)
    values ('ORD-REF-1', 'buyer@example.com', 'semester', 1199, 'MYR', 'stripe', 'pending', '2026-10-06', now())
    returning id
  `);
  const orderId = orderRes.rows[0].id;

  // Fulfill
  await db.query(`select public.assign_available_key($1)`, [orderId]);

  // Execute refund
  const refundRes = await db.query<{ process_refund: string }>(`
    select public.process_refund($1, 1199, 'Customer requested cancellation within 7 days', 'admin')
  `, [orderId]);

  assert.ok(refundRes.rows[0].process_refund, 'Expected refund ID');

  // Check order status
  const order = (await db.query<{ status: string }>(`select status from public.orders where id = $1`, [orderId])).rows[0];
  assert.equal(order.status, 'refunded');

  // Check license status
  const license = (await db.query<{ status: string }>(`select status from public.issued_licenses where order_id = $1`, [orderId])).rows[0];
  assert.equal(license.status, 'revoked');

  // Check key inventory status
  const inv = (await db.query<{ status: string }>(`select status from public.key_inventory where id = $1`, [invId])).rows[0];
  assert.equal(inv.status, 'revoked', 'Revoked key inventory must NOT be returned to available');

  // Check refund record
  const refundRecord = (await db.query<{ amount_minor: number; reason: string }>(`
    select amount_minor, reason from public.refunds where order_id = $1
  `, [orderId])).rows[0];
  assert.equal(refundRecord.amount_minor, 1199);

  // Check outbox events for refund email & admin alert
  const outbox = (await db.query<{ event_type: string }>(`
    select event_type from public.order_outbox where order_id = $1
  `, [orderId])).rows.map(r => r.event_type);

  assert.ok(outbox.includes('order_refund_email'));
  assert.ok(outbox.includes('admin_refund_alert'));
});
