import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadServerModule } from './helpers/server-module';
import { DEFAULT_SITE_CONFIG } from '../lib/site-config';

process.env.LOCAL_DB_PATH = join(mkdtempSync(join(tmpdir(), 'site-operations-')), 'operations.sqlite');
let store: typeof import('../lib/store');
before(async () => { store = await import('../lib/store'); });

function operations(options: { authorized?: boolean; local?: boolean } = {}) {
  const events: string[] = [];
  const module = loadServerModule<typeof import('../lib/site-operations')>('lib/site-operations.ts', {
    '@/lib/admin-auth': { requireAdminSession: async () => { events.push('auth'); if (options.authorized === false) throw new Error('UNAUTHORIZED'); } },
    '@/lib/admin-local': { isLocalAdminPreview: async () => { events.push('local'); return options.local ?? true; } },
  });
  return { module, events };
}

test('operations authenticate before checking local availability or processing identifiers', async () => {
  const { module, events } = operations({ authorized: false });
  await assert.rejects(module.getSiteOperations(), /UNAUTHORIZED/);
  await assert.rejects(module.runSiteOperation('refund', 'invalid', {}), /UNAUTHORIZED/);
  assert.deepEqual(events, ['auth', 'auth']);
});

test('non-local operations return unavailable data and reject writes before database access', async () => {
  const { module, events } = operations({ local: false });
  const data = await module.getSiteOperations();
  assert.equal(data.local, false);
  assert.equal(data.orders.length + data.tickets.length, 0);
  await assert.rejects(module.runSiteOperation('refund', 'invalid', {}), /LOCAL_ONLY/);
  assert.deepEqual(events, ['auth', 'local', 'auth', 'local']);
});

test('the real local admin guard rejects production, missing opt-in and external hosts', async () => {
  const oldEnvironment = process.env.NODE_ENV, oldDemo = process.env.LOCAL_DEMO;
  let host = 'localhost:3000';
  const security = loadServerModule<typeof import('../lib/security')>('lib/security.ts', { 'next/headers': {} }, { Request, Response });
  const local = loadServerModule<typeof import('../lib/admin-local')>('lib/admin-local.ts', {
    'next/headers': { headers: async () => ({ get: () => host }) },
    '@/lib/security': security,
  }, { Request });
  try {
    Object.assign(process.env, { NODE_ENV: 'development', LOCAL_DEMO: 'true' });
    for (host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) assert.equal(await local.isLocalAdminPreview(), true);
    for (host of ['example.com', 'localhost.example.com', 'localhost:bad', '']) assert.equal(await local.isLocalAdminPreview(), false);
    host = 'localhost:3000';
    Object.assign(process.env, { NODE_ENV: 'production' }); assert.equal(await local.isLocalAdminPreview(), false);
    Object.assign(process.env, { NODE_ENV: 'development' }); delete process.env.LOCAL_DEMO; assert.equal(await local.isLocalAdminPreview(), false);
  } finally {
    if (oldEnvironment === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: oldEnvironment });
    if (oldDemo === undefined) delete process.env.LOCAL_DEMO; else process.env.LOCAL_DEMO = oldDemo;
  }
});

test('operation validation accepts only supported actions, UUID records and bounded email/reply values', () => {
  const { module } = operations();
  const id = '27d4a80a-92b1-4b99-8465-4152f0c64bfc';
  for (const action of ['delete', '__proto__', null, 1]) assert.throws(() => module.validateOperation(action, id, {}), /INVALID_OPERATION/);
  for (const badId of ['../database', '', 'token', null]) assert.throws(() => module.validateOperation('refund', badId, {}), /INVALID_OPERATION/);
  for (const message of ['', '   ', 'a'.repeat(4001), 1]) assert.throws(() => module.validateOperation('reply', id, { message }), /INVALID_TEXT/);
  assert.throws(() => module.validateOperation('resend', id, { email: '' }), /INVALID_EMAIL/);
  assert.equal(module.validateOperation('resend', id, { email: ' TEST@example.com ', injected: true }).payload.email, 'test@example.com');
  assert.deepEqual(Object.keys(module.validateOperation('reply', id, { message: ' Reply ', token: 'secret' }).payload), ['message']);
});

test('checkout snapshots published prices and extension releases across later publication and completion', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  config.offer.enabled = false;
  config.packages.find(plan => plan.id === 'extension')!.amount = 2777;
  config.settings.extensionRelease = { assetId: '27d4a80a-92b1-4b99-8465-4152f0c64bfc', label: 'v1' };
  const order = store.createOrder({ plan: 'extension', locale: 'en', amount: 1 } as never, config);
  config.packages.find(plan => plan.id === 'extension')!.amount = 9999;
  config.settings.extensionRelease.label = 'v2';
  config.settings.extensionRelease.assetId = 'new-asset';
  store.completeOrder(order.token, 'buyer@example.com');
  const restored = store.getOrder(order.token)!;
  assert.equal(restored.amount, 2777);
  assert.deepEqual(restored.extensionRelease, { assetId: '27d4a80a-92b1-4b99-8465-4152f0c64bfc', label: 'v1' });
  const notification = store.createOrder({ plan: 'mobile_notification', locale: 'en' }, config);
  assert.equal(notification.extensionRelease, null);
});

test('checkout rejects unavailable packages, disabled checkout, maintenance and invalid cents without inserting', () => {
  const count = store.listOrders().length;
  for (const change of [
    (config: typeof DEFAULT_SITE_CONFIG) => { config.settings.maintenance = true; },
    (config: typeof DEFAULT_SITE_CONFIG) => { config.settings.checkoutEnabled = false; },
    (config: typeof DEFAULT_SITE_CONFIG) => { config.packages.find(plan => plan.id === 'extension')!.enabled = false; },
    (config: typeof DEFAULT_SITE_CONFIG) => { config.packages.find(plan => plan.id === 'extension')!.visible = false; },
  ]) {
    const config = structuredClone(DEFAULT_SITE_CONFIG); change(config);
    assert.throws(() => store.createOrder({ plan: 'extension', locale: 'en' }, config), /CHECKOUT_UNAVAILABLE/);
  }
  for (const amount of [0, -1, 1.5, NaN, Infinity]) {
    const config = structuredClone(DEFAULT_SITE_CONFIG); config.packages.find(plan => plan.id === 'extension')!.amount = amount;
    assert.throws(() => store.createOrder({ plan: 'extension', locale: 'en' }, config), /INVALID_PLAN/);
  }
  assert.equal(store.listOrders().length, count);
});

test('checkout route uses published settings after local request protection and rate limiting', async () => {
  const events: string[] = [];
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  const route = loadServerModule<typeof import('../app/api/checkout/route')>('app/api/checkout/route.ts', {
    '@/lib/security': { localOnly: () => { events.push('guard'); }, rateLimit: () => { events.push('limit'); }, apiError: () => Response.json({ error: 'safe' }, { status: 403 }) },
    '@/lib/site-settings': { getPublishedSiteConfig: async () => { events.push('published'); return config; } },
    '@/lib/store': { createOrder: (input: unknown, received: unknown) => { events.push('create'); assert.equal(received, config); assert.equal((input as { plan: string }).plan, 'extension'); return { token: 'private-token', reference: 'VF-TEST' }; } },
  }, { Response });
  const response = await route.POST(new Request('http://localhost/api/checkout', { method: 'POST', body: JSON.stringify({ plan: 'extension', locale: 'en' }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(events, ['guard', 'limit', 'published', 'create']);
});

test('closed tickets reject replies, reopen once and preserve the existing linked conversation', () => {
  const order = store.createOrder({ plan: 'extension', locale: 'en' });
  store.completeOrder(order.token, 'support@example.com');
  const ticket = store.createTicket({ email: 'support@example.com', reference: order.reference, subject: 'Download help', message: 'Please help with my download.', locale: 'en' });
  store.closeTicket(ticket.id);
  assert.throws(() => store.closeTicket(ticket.id), /INVALID_STATE/);
  assert.throws(() => store.replyTicket(ticket.id, 'Reply', 'admin'), /TICKET_CLOSED/);
  assert.equal(store.reopenTicket(ticket.id).status, 'open');
  assert.throws(() => store.reopenTicket(ticket.id), /INVALID_STATE/);
  store.replyTicket(ticket.id, 'Your link has been refreshed.', 'admin');
  const restored = store.getTicket(ticket.token)!;
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.reference, order.reference);
  assert.equal(restored.messages[1].author, 'admin');
});

test('operation action uses safe errors and records activity only after a successful mutation', async () => {
  const events: string[] = [];
  const id = '27d4a80a-92b1-4b99-8465-4152f0c64bfc';
  const action = loadServerModule<typeof import('../app/admin/operations-actions')>('app/admin/operations-actions.ts', {
    '@/lib/site-operations': { runSiteOperation: async (type: string) => { events.push('operation'); if (type === 'refund') throw new Error('private database token'); return 'Ticket reopened.'; } },
    '@/lib/site-settings': { recordSiteActivity: async (type: string) => { events.push(type); } },
    'next/cache': { revalidatePath: (path: string) => { events.push(path); } },
  });
  const failure = await action.operationAction('refund', id, {});
  assert.ok('error' in failure);
  assert.doesNotMatch(JSON.stringify(failure), /private database token/);
  assert.deepEqual(events, ['operation']);
  events.length = 0;
  const success = await action.operationAction('reopen', id, {});
  assert.ok('ok' in success);
  assert.deepEqual(events, ['operation', 'operations.reopen', '/admin', '/admin/management']);
});
