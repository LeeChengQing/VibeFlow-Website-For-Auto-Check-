import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  createSupportTicket,
  getSupportTicketByToken,
  replySupportTicketByToken,
  adminReplySupportTicket,
  adminCloseSupportTicket,
  adminReopenSupportTicket,
  listSupportTickets,
} from '@/lib/support/support-service';

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

test('support ticket lifecycle with capability token and messages in postgres', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // 1. Create a support ticket
  const { ticket, token, url } = await createSupportTicket(db, {
    email: 'student@university.edu.my',
    subject: 'Cannot activate on second device',
    message: 'Hello, I get an error saying device limit reached.',
    locale: 'en',
  });

  assert.ok(ticket.id);
  assert.ok(ticket.reference.startsWith('TK-'));
  assert.equal(ticket.email, 'student@university.edu.my');
  assert.equal(ticket.status, 'open');
  assert.equal(ticket.messages.length, 1);
  assert.equal(ticket.messages[0].author, 'customer');
  assert.equal(ticket.messages[0].body, 'Hello, I get an error saying device limit reached.');
  assert.ok(token.length >= 32);
  assert.equal(url, `/support/${token}`);

  // 2. Fetch ticket by capability token
  const fetched = await getSupportTicketByToken(db, token);
  assert.ok(fetched);
  assert.equal(fetched.id, ticket.id);
  assert.equal(fetched.reference, ticket.reference);
  assert.equal(fetched.messages.length, 1);

  // 3. Invalid token returns null
  const notFound = await getSupportTicketByToken(db, 'wrong-token-value');
  assert.equal(notFound, null);

  // 4. Customer replies
  const replied = await replySupportTicketByToken(db, token, 'I also tried restarting Chrome but it did not help.');
  assert.equal(replied.messages.length, 2);
  assert.equal(replied.messages[1].author, 'customer');
  assert.equal(replied.messages[1].body, 'I also tried restarting Chrome but it did not help.');

  // 5. Admin replies
  const adminReplied = await adminReplySupportTicket(db, ticket.id, 'We have reset your device allocation. Please try again.');
  assert.equal(adminReplied.messages.length, 3);
  assert.equal(adminReplied.messages[2].author, 'admin');
  assert.equal(adminReplied.messages[2].body, 'We have reset your device allocation. Please try again.');

  // 6. Admin closes ticket
  const closed = await adminCloseSupportTicket(db, ticket.id);
  assert.equal(closed.status, 'closed');

  // 7. Customer reply to closed ticket is rejected
  await assert.rejects(
    async () => replySupportTicketByToken(db, token, 'Can you help more?'),
    /TICKET_CLOSED/
  );

  // 8. Admin reopens ticket
  const reopened = await adminReopenSupportTicket(db, ticket.id);
  assert.equal(reopened.status, 'open');

  // 9. Customer can reply again after reopening
  const replyAfterReopen = await replySupportTicketByToken(db, token, 'Thank you, it works now!');
  assert.equal(replyAfterReopen.messages.length, 4);

  // 10. List all tickets
  const allTickets = await listSupportTickets(db);
  assert.equal(allTickets.length, 1);
  assert.equal(allTickets[0].messages.length, 4);
});

test('support ticket rejects invalid input and mismatched orders', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // Insert a dummy order
  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, status
    ) values (
      '00000000-0000-4000-8000-000000000001', 'VF-TEST-100', 'owner@example.com',
      'extension', 'MYR', 3900, 'stripe', 'paid'
    )
  `);

  // Invalid email
  await assert.rejects(
    async () => createSupportTicket(db, {
      email: 'not-an-email',
      subject: 'Question',
      message: 'Valid message body here',
    }),
    /INVALID_EMAIL/
  );

  // Too short subject
  await assert.rejects(
    async () => createSupportTicket(db, {
      email: 'valid@example.com',
      subject: 'x',
      message: 'Valid message body here',
    }),
    /INVALID_TEXT/
  );

  // Too short message
  await assert.rejects(
    async () => createSupportTicket(db, {
      email: 'valid@example.com',
      subject: 'Valid Subject',
      message: 'hi',
    }),
    /INVALID_TEXT/
  );

  // Order mismatch: email does not match order email
  await assert.rejects(
    async () => createSupportTicket(db, {
      email: 'impostor@example.com',
      reference: 'VF-TEST-100',
      subject: 'Order Help',
      message: 'I want a refund for this order',
    }),
    /ORDER_MISMATCH/
  );

  // Matching order reference succeeds
  const { ticket } = await createSupportTicket(db, {
    email: 'owner@example.com',
    reference: 'VF-TEST-100',
    subject: 'Order Help',
    message: 'I need assistance with my order',
  });
  assert.equal(ticket.reference.startsWith('TK-'), true);
});

test('support API route handles POST creation and GET/POST by token', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const { loadServerModule } = await import('./helpers/server-module');

  const supportRoute = loadServerModule<any>('app/api/support/route.ts', {
    'server-only': {},
    '@/lib/supabase/commerce': {
      getCommerceDatabase: () => db,
      isCommerceConfigured: () => true,
    },
    '@/lib/security': {
      rateLimit: () => {},
      apiError: (err: any) => Response.json({ error: err.message }, { status: 400 }),
    },
  }, {
    Request, Response, AbortSignal, Headers,
    process: { env: { NODE_ENV: 'production' } },
  });

  const tokenRoute = loadServerModule<any>('app/api/support/[token]/route.ts', {
    'server-only': {},
    '@/lib/supabase/commerce': {
      getCommerceDatabase: () => db,
      isCommerceConfigured: () => true,
    },
    '@/lib/security': {
      rateLimit: () => {},
      apiError: (err: any) => Response.json({ error: err.message }, { status: 400 }),
    },
  }, {
    Request, Response, AbortSignal, Headers,
    process: { env: { NODE_ENV: 'production' } },
  });

  // 1. Create ticket via POST /api/support
  const createReq = new Request('https://auto-check.example/api/support', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'api-user@example.com',
      subject: 'API Support Request',
      message: 'This is a message sent through the API.',
      locale: 'zh',
    }),
  });
  const createRes = await supportRoute.POST(createReq);
  assert.equal(createRes.status, 200);
  const { url } = await createRes.json();
  assert.ok(url.startsWith('/support/'));
  const token = url.replace('/support/', '');

  // 2. Fetch ticket via GET /api/support/[token]
  const getReq = new Request(`https://auto-check.example/api/support/${token}`, { method: 'GET' });
  const getRes = await tokenRoute.GET(getReq, { params: Promise.resolve({ token }) });
  assert.equal(getRes.status, 200);
  assert.equal(getRes.headers.get('Cache-Control'), 'no-store');
  const ticketData = await getRes.json();
  assert.equal(ticketData.email, 'api-user@example.com');
  assert.equal(ticketData.messages.length, 1);

  // 3. Customer reply via POST /api/support/[token]
  const replyReq = new Request(`https://auto-check.example/api/support/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'A follow-up question.' }),
  });
  const replyRes = await tokenRoute.POST(replyReq, { params: Promise.resolve({ token }) });
  assert.equal(replyRes.status, 200);
  const updatedTicket = await replyRes.json();
  assert.equal(updatedTicket.messages.length, 2);
  assert.equal(updatedTicket.messages[1].body, 'A follow-up question.');
});

