import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadServerModule } from './helpers/server-module';

const handlerModule = loadServerModule<any>('lib/payments/stripe-webhook-events.ts', {
  'server-only': {},
  '@/lib/stripe-fulfillment': { fulfillStripeSession: async () => {} },
});
const { handleStripeWebhookEvent } = handlerModule;

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

test('stripe webhook handles expired and async_payment_failed by cancelling pending orders', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // 1. Pending order expired
  const order1Id = '00000000-0000-4000-8000-000000000001';
  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_request_id, status
    ) values (
      $1, 'VF-EXP-001', 'buyer@example.com', 'extension', 'MYR', 3900,
      'stripe', 'cs_test_expired_1', 'pending'
    )
  `, [order1Id]);

  await handleStripeWebhookEvent(db, {
    id: 'evt_expired_1',
    type: 'checkout.session.expired',
    data: {
      object: { id: 'cs_test_expired_1' } as any,
    },
  } as any);

  const order1 = (await db.query<any>(`select status from public.orders where id = $1`, [order1Id])).rows[0];
  assert.equal(order1.status, 'cancelled');

  // 2. Pending order async_payment_failed
  const order2Id = '00000000-0000-4000-8000-000000000002';
  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_request_id, status
    ) values (
      $1, 'VF-FAIL-002', 'buyer2@example.com', 'semester', 'MYR', 1900,
      'stripe', 'cs_test_failed_2', 'pending'
    )
  `, [order2Id]);

  await handleStripeWebhookEvent(db, {
    id: 'evt_failed_2',
    type: 'checkout.session.async_payment_failed',
    data: {
      object: { id: 'cs_test_failed_2' } as any,
    },
  } as any);

  const order2 = (await db.query<any>(`select status from public.orders where id = $1`, [order2Id])).rows[0];
  assert.equal(order2.status, 'cancelled');
});

test('stripe webhook handles charge.refunded by revoking license, marking key revoked, and enqueuing outbox', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = '00000000-0000-4000-8000-000000000010';
  const invId = '00000000-0000-4000-8000-000000000011';
  const licId = '00000000-0000-4000-8000-000000000012';
  const paymentIntentId = 'pi_test_refund_10';
  const keyHash = 'd'.repeat(64);

  // Setup paid order, assigned key, active license
  await db.query(`
    insert into public.key_inventory (id, key_hash, plan_type, status, encrypted_key)
    values ($1, $2, 'core', 'assigned', 'v1.enc.key')
  `, [invId, keyHash]);

  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_payment_id, status
    ) values (
      $1, 'VF-REF-010', 'refundme@example.com', 'extension', 'MYR', 3900,
      'stripe', $2, 'paid'
    )
  `, [orderId, paymentIntentId]);

  await db.query(`
    insert into public.issued_licenses (id, order_id, inventory_id, buyer_email, plan_type, status)
    values ($1, $2, $3, 'refundme@example.com', 'core', 'active')
  `, [licId, orderId, invId]);

  // Handle charge.refunded event
  await handleStripeWebhookEvent(db, {
    id: 'evt_refund_10',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_10',
        payment_intent: paymentIntentId,
        amount_refunded: 3900,
      } as any,
    },
  } as any);

  // 1. Order status is now 'refunded'
  const ord = (await db.query<any>(`select status from public.orders where id = $1`, [orderId])).rows[0];
  assert.equal(ord.status, 'refunded');

  // 2. License is revoked
  const lic = (await db.query<any>(`select status from public.issued_licenses where id = $1`, [licId])).rows[0];
  assert.equal(lic.status, 'revoked');

  // 3. Key inventory item is marked 'revoked' (not recycled)
  const inv = (await db.query<any>(`select status from public.key_inventory where id = $1`, [invId])).rows[0];
  assert.equal(inv.status, 'revoked');

  // 4. Refunds row created
  const refRows = (await db.query<any>(`select * from public.refunds where order_id = $1`, [orderId])).rows;
  assert.equal(refRows.length, 1);
  assert.equal(refRows[0].amount_minor, 3900);
  assert.equal(refRows[0].provider, 'stripe');

  // 5. Outbox has refund email task
  const outbox = (await db.query<any>(`select * from public.order_outbox where order_id = $1 and event_type = 'order_refund_email'`, [orderId])).rows;
  assert.equal(outbox.length, 1);

  // 6. Idempotent re-run does not crash or double refund
  await handleStripeWebhookEvent(db, {
    id: 'evt_refund_10_dup',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_10',
        payment_intent: paymentIntentId,
        amount_refunded: 3900,
      } as any,
    },
  } as any);
  const refRowsAfter = (await db.query<any>(`select * from public.refunds where order_id = $1`, [orderId])).rows;
  assert.equal(refRowsAfter.length, 1);
});

test('stripe webhook handles charge.dispute.created by recording dispute and alerting admin', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = '00000000-0000-4000-8000-000000000020';
  const paymentIntentId = 'pi_test_dispute_20';

  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_payment_id, status
    ) values (
      $1, 'VF-DISP-020', 'disputer@example.com', 'extension', 'MYR', 3900,
      'stripe', $2, 'paid'
    )
  `, [orderId, paymentIntentId]);

  await handleStripeWebhookEvent(db, {
    id: 'evt_dispute_20',
    type: 'charge.dispute.created',
    data: {
      object: {
        id: 'dp_test_20',
        payment_intent: paymentIntentId,
        amount: 3900,
        status: 'needs_response',
      } as any,
    },
  } as any);

  const disputes = (await db.query<any>(`select * from public.disputes where order_id = $1`, [orderId])).rows;
  assert.equal(disputes.length, 1);
  assert.equal(disputes[0].provider_ref, 'dp_test_20');
  assert.equal(disputes[0].amount_minor, 3900);
});
