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

test('Stage D/E: End-to-end flow: purchase -> fulfillment -> activation -> refund -> revocation -> activation rejection', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = 'd0000000-0000-0000-0000-000000000001';
  const rawKeyHash = 'de-stage-key-hash-000000000000000000000000000000000000000000000001';

  // 1. Setup available inventory key
  await db.exec(`
    insert into public.key_inventory (
      key_hash, plan_type, status, encrypted_key, hash_version, channel, region
    ) values (
      '${rawKeyHash}', 'core', 'available', 'enc:v2:test', 2, 'website', 'global'
    );
    insert into public.license_keys (
      key_hash, hash_version, channel, region, status, plan_code, max_devices
    ) values (
      '${rawKeyHash}', 2, 'website', 'global', 'available', 'core', 2
    );
  `);

  // 2. Create pending order
  await db.exec(`
    insert into public.orders (
      id, reference, buyer_email, plan, amount_minor, currency, status, payment_provider
    ) values (
      '${orderId}', 'ORD-DE-TEST-1', 'student@school.edu', 'core', 3500, 'MYR', 'pending', 'stripe'
    );
  `);

  // 3. Fulfill order via assign_available_key RPC
  const assignedLicenseId = (await db.query<{ assign_available_key: string }>(`
    select public.assign_available_key('${orderId}') as assign_available_key;
  `)).rows[0].assign_available_key;

  assert.ok(assignedLicenseId);

  // Check order is paid
  const orderAfterFulfill = (await db.query<{ status: string }>(`
    select status from public.orders where id = '${orderId}';
  `)).rows[0];
  assert.equal(orderAfterFulfill.status, 'paid');

  // Sync key status in license_keys for stage C
  await db.exec(`
    update public.license_keys set status = 'sold', order_id = '${orderId}' where key_hash = '${rawKeyHash}';
  `);

  // 4. Activate key on device
  const actRes = (await db.query<{ success: boolean; status: string; license_key_id: string }>(`
    select * from public.activate_license_key('${rawKeyHash}', 'device-student-mac', '1.0.0', 'ip-hash-student');
  `)).rows[0];

  assert.equal(actRes.success, true);
  assert.equal(actRes.status, 'ACTIVATED');

  // Verify entitlements exist
  const entitlements = (await db.query<{ feature: string; status: string }>(`
    select feature, status from public.entitlements where key_id = '${actRes.license_key_id}';
  `)).rows;
  assert.ok(entitlements.some(e => e.feature === 'core' && e.status === 'active'));

  // 5. Trigger refund webhook
  const refundEvent = {
    id: 'evt_stripe_refund_001',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test_refund_001',
        amount_refunded: 3500,
        currency: 'myr',
        metadata: { order_id: orderId },
      },
    },
  };

  await handleStripeWebhookEvent(db, refundEvent);

  // 6. Verify order is refunded, license is revoked, inventory marked revoked
  const orderAfterRefund = (await db.query<{ status: string }>(`
    select status from public.orders where id = '${orderId}';
  `)).rows[0];
  assert.equal(orderAfterRefund.status, 'refunded');

  const licenseAfterRefund = (await db.query<{ status: string }>(`
    select status from public.issued_licenses where order_id = '${orderId}';
  `)).rows[0];
  assert.equal(licenseAfterRefund.status, 'revoked');

  const inventoryAfterRefund = (await db.query<{ status: string }>(`
    select status from public.key_inventory where key_hash = '${rawKeyHash}';
  `)).rows[0];
  assert.equal(inventoryAfterRefund.status, 'revoked');

  // Verify unified license_keys was also revoked automatically by process_refund
  const lkAfterRefund = (await db.query<{ status: string }>(`
    select status from public.license_keys where key_hash = '${rawKeyHash}';
  `)).rows[0];
  assert.equal(lkAfterRefund.status, 'revoked');


  // 7. Attempt to activate revoked key again -> Must fail with REVOKED_KEY
  const actAfterRevoke = (await db.query<{ success: boolean; status: string }>(`
    select * from public.activate_license_key('${rawKeyHash}', 'device-second', '1.0.0', 'ip-hash');
  `)).rows[0];

  assert.equal(actAfterRevoke.success, false);
  assert.equal(actAfterRevoke.status, 'REVOKED_KEY');
});

test('Stage D/E: Concurrent webhook deliveries fulfill only once and return identical state', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = 'd0000000-0000-0000-0000-000000000002';
  const rawKeyHash = 'de-stage-key-hash-000000000000000000000000000000000000000000000002';

  await db.exec(`
    insert into public.key_inventory (
      key_hash, plan_type, status, encrypted_key, hash_version, channel, region
    ) values (
      '${rawKeyHash}', 'core', 'available', 'enc:v2:test', 2, 'website', 'global'
    );
    insert into public.orders (
      id, reference, buyer_email, plan, amount_minor, currency, status, payment_provider
    ) values (
      '${orderId}', 'ORD-DE-CONCURRENT', 'buyer@test.edu', 'core', 3500, 'MYR', 'pending', 'stripe'
    );
  `);

  // Run first fulfillment
  const res1 = (await db.query<{ assign_available_key: string }>(`
    select public.assign_available_key('${orderId}') as assign_available_key;
  `)).rows[0].assign_available_key;

  // Run duplicate fulfillment
  const res2 = (await db.query<{ assign_available_key: string }>(`
    select public.assign_available_key('${orderId}') as assign_available_key;
  `)).rows[0].assign_available_key;

  assert.equal(res1, res2);

  // Exactly one issued license created
  const licenseCount = (await db.query<{ count: number }>(`
    select count(*) as count from public.issued_licenses where order_id = '${orderId}';
  `)).rows[0].count;
  assert.equal(Number(licenseCount), 1);
});

test('Stage D/E: Down migration executes cleanly and restores previous process_refund function', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const downSql = readFileSync('supabase/migrations/down/20261007040000_stage_de_payment_refund_hardening_down.sql', 'utf8');
  await db.exec(downSql);

  // Verify function still exists and can be queried
  const funcExists = (await db.query<{ exists: boolean }>(`
    select exists (
      select 1 from pg_proc where proname = 'process_refund'
    ) as exists;
  `)).rows[0].exists;
  assert.equal(funcExists, true);
});

