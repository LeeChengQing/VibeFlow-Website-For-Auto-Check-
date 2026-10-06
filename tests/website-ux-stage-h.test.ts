import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { handleOrderRecovery } from '../lib/recovery/order-recovery-service';
import { checkPaymentProviderEnabled } from '../lib/payments/provider-status';

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

test('Stage H: Order recovery API enqueues recovery email for existing orders with anti-enumeration protection', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = 'a0000000-0000-0000-0000-000000000001';
  const email = 'existing_student@school.edu';

  await db.exec(`
    insert into public.orders (
      id, reference, buyer_email, plan, amount_minor, currency, status, payment_provider
    ) values (
      '${orderId}', 'ORD-H-REC-1', '${email}', 'core', 3500, 'MYR', 'paid', 'stripe'
    );
  `);

  // 1. Recover existing order
  const resExisting = await handleOrderRecovery(db, {
    email,
    clientIp: '127.0.0.1',
  });

  assert.equal(resExisting.success, true);
  assert.equal(resExisting.message, 'If an active order exists for this email, recovery instructions have been sent.');

  // Verify recovery task enqueued in outbox
  const outbox = (await db.query<{ event_type: string; payload: any }>(`
    select event_type, payload from public.order_outbox where order_id = '${orderId}';
  `)).rows;

  assert.ok(outbox.some(o => o.event_type === 'order_recovery_email'));

  // 2. Recover non-existent order -> Returns IDENTICAL message to prevent email enumeration
  const resNonExistent = await handleOrderRecovery(db, {
    email: 'non_existent@school.edu',
    clientIp: '127.0.0.1',
  });

  assert.equal(resNonExistent.success, true);
  assert.equal(resNonExistent.message, 'If an active order exists for this email, recovery instructions have been sent.');
});

test('Stage H: Order recovery API rejects invalid emails and rate limits rapid requests', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // 1. Invalid email rejected
  const resInvalid = await handleOrderRecovery(db, {
    email: 'not-an-email',
    clientIp: '127.0.0.1',
  });
  assert.equal(resInvalid.success, false);
  assert.equal(resInvalid.error, 'INVALID_EMAIL');

  // 2. Rate limit testing
  const spamIp = '198.51.100.42';
  for (let i = 0; i < 5; i++) {
    await handleOrderRecovery(db, { email: `test_${i}@example.com`, clientIp: spamIp });
  }

  // 6th request within 1 minute from same IP -> RATE_LIMIT_EXCEEDED
  const resRateLimit = await handleOrderRecovery(db, {
    email: 'spam_test@example.com',
    clientIp: spamIp,
  });

  assert.equal(resRateLimit.success, false);
  assert.equal(resRateLimit.error, 'RATE_LIMIT_EXCEEDED');
});

test('Stage H: Payment provider killswitches independently disable gateways', () => {
  // 1. Both enabled by default
  const defaultStatus = checkPaymentProviderEnabled('stripe', {});
  assert.equal(defaultStatus.enabled, true);

  // 2. Stripe disabled via env var
  const stripeDisabled = checkPaymentProviderEnabled('stripe', {
    PAYMENTS_STRIPE_ENABLED: 'false',
  });
  assert.equal(stripeDisabled.enabled, false);
  assert.equal(stripeDisabled.reason, 'PROVIDER_TEMPORARILY_DISABLED');

  // ToyyibPay remains enabled
  const toyyibEnabled = checkPaymentProviderEnabled('toyyibpay', {
    PAYMENTS_STRIPE_ENABLED: 'false',
  });
  assert.equal(toyyibEnabled.enabled, true);

  // 3. ToyyibPay disabled via env var
  const toyyibDisabled = checkPaymentProviderEnabled('toyyibpay', {
    PAYMENTS_TOYYIBPAY_ENABLED: '0',
  });
  assert.equal(toyyibDisabled.enabled, false);
});
