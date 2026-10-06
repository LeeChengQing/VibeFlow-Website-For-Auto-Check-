import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadServerModule } from './helpers/server-module';
import type { EmailDeliveryAdapter } from '../lib/mail/email-service';

const encryption = loadServerModule<any>('lib/license-key-encryption.ts', {});
const worker = loadServerModule<any>('lib/outbox/worker.ts', {
  '@/lib/license-key-encryption': encryption,
});
const { processOutboxBatch } = worker;
const { encryptLicenseKey } = encryption;

import { readdirSync } from 'node:fs';

async function setupDatabase() {
  const pg = new PGlite();
  await pg.exec(`
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
    await pg.exec(sql);
  }
  return pg;
}

import { createHash } from 'node:crypto';

test('outbox worker drains fulfillment tasks and sends email via delivery adapter', async () => {
  const pg = await setupDatabase();
  const orderId = 'b1111111-2222-3333-4444-555555555555';
  const buyerEmail = 'buyer@student.edu';

  // Seed order and key inventory
  const plainKey = 'CORE-ABCD-EFGH-IJKL';
  const keyHash = createHash('sha256').update(plainKey).digest('hex');
  const encryptedKey = encryptLicenseKey(plainKey, keyHash);

  const invResult = await pg.query<{ id: string }>(`
    insert into public.key_inventory (key_hash, encrypted_key, plan_type, status)
    values ($1, $2, 'core', 'available')
    returning id;
  `, [keyHash, encryptedKey]);
  const inventoryId = invResult.rows[0].id;

  await pg.query(`
    insert into public.orders (id, reference, buyer_email, plan, amount_minor, currency, payment_provider, status)
    values ($1::uuid, $1::text, $2, 'extension', 2499, 'MYR', 'stripe', 'pending');
  `, [orderId, buyerEmail]);

  // Run atomic assignment RPC
  await pg.query(`select public.assign_available_key($1);`, [orderId]);

  // Check outbox has 1 pending fulfillment task
  const outboxBefore = await pg.query<{ id: string; status: string; event_type: string }>(`
    select id, status, event_type from public.order_outbox where order_id = $1;
  `, [orderId]);
  assert.equal(outboxBefore.rows.length, 1);
  assert.equal(outboxBefore.rows[0].status, 'pending');
  assert.equal(outboxBefore.rows[0].event_type, 'order_fulfillment_email');

  // Create mock delivery adapter
  const sentEmails: any[] = [];
  const mockAdapter: EmailDeliveryAdapter = {
    sendFulfillmentEmail: async (payload) => {
      sentEmails.push(payload);
      return { messageId: 'msg-test-123' };
    },
    sendRefundEmail: async () => ({ messageId: 'msg-refund-123' }),
    sendAlert: async () => ({ ok: true }),
  };

  // Process outbox batch
  const result = await processOutboxBatch(pg, { emailAdapter: mockAdapter });

  assert.equal(result.processed, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);

  // Email payload verified
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, buyerEmail);
  assert.equal(sentEmails[0].licenseKey, plainKey);
  assert.equal(sentEmails[0].plan, 'extension');

  // Outbox row marked completed with processed_at
  const outboxAfter = await pg.query<{ status: string; processed_at: string; attempts: number }>(`
    select status, processed_at, attempts from public.order_outbox where order_id = $1;
  `, [orderId]);
  assert.equal(outboxAfter.rows[0].status, 'completed');
  assert.ok(outboxAfter.rows[0].processed_at);
  assert.equal(outboxAfter.rows[0].attempts, 1);
});

test('outbox worker retries transient failures with exponential backoff and caps at max_attempts', async () => {
  const pg = await setupDatabase();
  const orderId = 'c1111111-2222-3333-4444-555555555555';

  await pg.query(`
    insert into public.orders (id, reference, buyer_email, plan, amount_minor, currency, payment_provider, status)
    values ($1::uuid, $1::text, 'failing@student.edu', 'bundle', 4999, 'MYR', 'stripe', 'paid');
  `, [orderId]);
  await pg.query(`
    insert into public.order_outbox (order_id, event_type, idempotency_key, payload, status, max_attempts)
    values ($1, 'order_fulfillment_email', 'retry-test', '{"email":"failing@student.edu","plain_key":"KEY-123"}'::jsonb, 'pending', 3);
  `, [orderId]);

  const failingAdapter: EmailDeliveryAdapter = {
    sendFulfillmentEmail: async () => {
      throw new Error('Resend 500 Provider Temporary Down');
    },
    sendRefundEmail: async () => ({ messageId: 'refund-msg' }),
    sendAlert: async () => ({ ok: true }),
  };

  // 1st attempt: fails, increments attempts to 1, schedules backoff
  const res1 = await processOutboxBatch(pg, { emailAdapter: failingAdapter });
  assert.equal(res1.failed, 1);

  const row1 = (await pg.query<{ attempts: number; status: string; last_error: string }>(`
    select attempts, status, last_error from public.order_outbox where order_id = $1;
  `, [orderId])).rows[0];
  assert.equal(row1.attempts, 1);
  assert.equal(row1.status, 'pending');
  assert.match(row1.last_error, /Resend 500/);

  // Force time forward to next_attempt_at for attempt 2 and 3
  await pg.query(`update public.order_outbox set next_attempt_at = now() - interval '1 second', attempts = 2 where order_id = $1;`, [orderId]);

  // 3rd attempt: reaches max_attempts (3), marks failed
  const res3 = await processOutboxBatch(pg, { emailAdapter: failingAdapter });
  assert.equal(res3.failed, 1);

  const row3 = (await pg.query<{ attempts: number; status: string }>(`
    select attempts, status from public.order_outbox where order_id = $1;
  `, [orderId])).rows[0];
  assert.equal(row3.attempts, 3);
  assert.equal(row3.status, 'failed');
});
