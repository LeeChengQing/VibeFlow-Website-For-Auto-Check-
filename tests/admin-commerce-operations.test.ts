import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadServerModule } from './helpers/server-module';

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

test('commerce site operations list data and execute real database mutations', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = '00000000-0000-4000-8000-000000000030';
  const invId = '00000000-0000-4000-8000-000000000031';
  const licId = '00000000-0000-4000-8000-000000000032';
  const keyHash = 'e'.repeat(64);

  // Seed inventory, order, license
  await db.query(`
    insert into public.key_inventory (id, key_hash, plan_type, status, encrypted_key)
    values ($1, $2, 'core', 'assigned', 'v1.enc.key')
  `, [invId, keyHash]);

  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_payment_id, status
    ) values (
      $1, 'VF-ADMIN-030', 'customer@example.com', 'extension', 'MYR', 3900,
      'stripe', 'pi_test_admin_30', 'paid'
    )
  `, [orderId]);

  await db.query(`
    insert into public.issued_licenses (id, order_id, inventory_id, buyer_email, plan_type, status)
    values ($1, $2, $3, 'customer@example.com', 'core', 'active')
  `, [licId, orderId, invId]);

  // Seed ticket
  const ticketId = '00000000-0000-4000-8000-000000000040';
  await db.query(`
    insert into public.support_tickets (
      id, reference, email, subject, status, access_token_hash, created_at, updated_at
    ) values ($1, 'TK-TEST-30', 'customer@example.com', 'Help please', 'open', 'dummy_hash', now(), now())
  `, [ticketId]);

  await db.query(`
    insert into public.support_messages (id, ticket_id, sender, message, created_at)
    values ('00000000-0000-4000-8000-000000000041', $1, 'customer', 'Initial message', now())
  `, [ticketId]);

  const opsModule = loadServerModule<any>('lib/site-operations.ts', {
    'server-only': {},
    '@/lib/admin-auth': { requireAdminSession: async () => ({ issuedAt: 1, expiresAt: 9999999999 }) },
    '@/lib/admin-local': { isLocalAdminPreview: async () => false },
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db, isCommerceConfigured: () => true },
  }, {
    Request, Response, AbortSignal,
    process: { env: { NODE_ENV: 'production' } },
  });

  // 1. getSiteOperations returns real orders and tickets
  const data = await opsModule.getSiteOperations();
  assert.equal(data.local, false);
  assert.equal(data.orders.length, 1);
  assert.equal(data.orders[0].reference, 'VF-ADMIN-030');
  assert.equal(data.tickets.length, 1);
  assert.equal(data.tickets[0].reference, 'TK-TEST-30');

  // 2. runSiteOperation 'reply'
  const replyResult = await opsModule.runSiteOperation('reply', ticketId, { message: 'Admin reply here.' });
  assert.ok(replyResult.includes('Reply saved'));

  const ticketMessages = (await db.query<any>(`select sender, message from public.support_messages where ticket_id = $1 order by created_at asc`, [ticketId])).rows;
  assert.equal(ticketMessages.length, 2);
  assert.equal(ticketMessages[1].sender, 'admin');
  assert.equal(ticketMessages[1].message, 'Admin reply here.');

  // 3. runSiteOperation 'close'
  const closeResult = await opsModule.runSiteOperation('close', ticketId);
  assert.ok(closeResult.includes('closed'));
  const closedTicket = (await db.query<any>(`select status from public.support_tickets where id = $1`, [ticketId])).rows[0];
  assert.equal(closedTicket.status, 'closed');

  // 4. runSiteOperation 'reopen'
  const reopenResult = await opsModule.runSiteOperation('reopen', ticketId);
  assert.ok(reopenResult.includes('reopened'));
  const reopenedTicket = (await db.query<any>(`select status from public.support_tickets where id = $1`, [ticketId])).rows[0];
  assert.equal(reopenedTicket.status, 'open');

  // 5. runSiteOperation 'refund'
  const refundResult = await opsModule.runSiteOperation('refund', orderId);
  assert.ok(refundResult.includes('Refund processed'));

  const refundedOrder = (await db.query<any>(`select status from public.orders where id = $1`, [orderId])).rows[0];
  assert.equal(refundedOrder.status, 'refunded');

  const revokedLicense = (await db.query<any>(`select status from public.issued_licenses where id = $1`, [licId])).rows[0];
  assert.equal(revokedLicense.status, 'revoked');

  const revokedInv = (await db.query<any>(`select status from public.key_inventory where id = $1`, [invId])).rows[0];
  assert.equal(revokedInv.status, 'revoked');

  // 6. runSiteOperation 'resend'
  const resendResult = await opsModule.runSiteOperation('resend', orderId, { email: 'updated@example.com' });
  assert.ok(resendResult.includes('delivery enqueued') || resendResult.includes('refreshed'));
});
