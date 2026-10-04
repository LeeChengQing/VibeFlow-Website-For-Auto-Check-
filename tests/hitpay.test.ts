import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { loadServerModule } from './helpers/server-module';
import { DEFAULT_SITE_CONFIG, packagePrice, purchaseAllowed } from '../lib/site-config';

const orderId = 'fbbd355f-e574-4d1a-82cd-dfbd62c8ac64';
const requestId = '7691fe95-ea32-4147-b7ab-c4c1dfdece30';
const paymentId = 'bd146979-95ce-46f7-b1c0-bbe2f6698f30';
const env = { HITPAY_ENABLED: 'true', HITPAY_ENVIRONMENT: 'sandbox', HITPAY_API_KEY: 'sandbox-key', HITPAY_WEBHOOK_SALT: 'endpoint-salt' };
const helper = () => loadServerModule<any>('lib/hitpay.ts', {}, { Response, AbortSignal, process: { env } });

function fixture(options: { admin?: boolean; rpcError?: string; dbError?: boolean; config?: typeof DEFAULT_SITE_CONFIG; providerFail?: boolean; providerURL?: string; env?: Partial<typeof env> } = {}) {
  let row: any = null;
  let authCalls = 0;
  const calls: any[] = [], alerts: any[] = [];
  const db = {
    from: (table: string) => {
      assert.equal(table, 'orders');
      let operation = 'select', values: any, filters: any[] = [];
      const query: any = {
        insert: (value: any) => { operation = 'insert'; values = value; return query; },
        update: (value: any) => { operation = 'update'; values = value; return query; },
        select: () => query,
        eq: (field: string, value: any) => { filters.push([field, value]); return query; },
        is: (field: string, value: any) => { filters.push([field, value]); return query; },
        maybeSingle: () => query,
        single: () => query,
        then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          calls.push({ operation, values, filters });
          if (options.dbError) return { data: null, error: { message: 'database unavailable' } };
          if (operation === 'insert') row = { ...values, provider_payment_id: null, provider_request_id: null, payment_confirmed_at: null, fulfillment_error: null };
          const matches = row && filters.every(([field, value]) => row[field] === value);
          if (operation === 'update' && matches) row = { ...row, ...values };
          return { data: operation === 'insert' || matches || filters.length === 0 ? row && { ...row } : null, error: null };
        }).then(resolve, reject),
      };
      return query;
    },
    rpc: async (name: string, args: any) => {
      calls.push({ rpc: name, args });
      if (options.rpcError) return { data: null, error: { message: options.rpcError } };
      row.status = 'paid'; return { data: 'license-id', error: null };
    },
  };
  const taskEnv = { ...env, ...options.env };
  const globals = { Request, Response, AbortSignal, console: { error: (...args: any[]) => alerts.push(args) }, process: { env: taskEnv },
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ provider: url, init });
      if (options.providerFail) return Response.json({ error: 'private provider details' }, { status: 500 });
      return Response.json({ id: requestId, url: options.providerURL ?? `https://securecheckout.sandbox.hit-pay.com/payment-request/${requestId}/checkout` });
    },
  };
  const dependencies = {
    '@/lib/hitpay': loadServerModule<any>('lib/hitpay.ts', {}, { Response, AbortSignal, process: { env: taskEnv } }),
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db },
    '@/lib/site-config': { packagePrice, purchaseAllowed },
    '@/lib/site-settings': { getPublishedSiteConfig: async () => options.config ?? DEFAULT_SITE_CONFIG },
    '@/lib/admin-auth': { requireAdminSession: async () => { authCalls++; if (!options.admin) throw new Error('ADMIN_UNAUTHORIZED'); } },
    'node:crypto': { ...requireCrypto(), randomUUID: () => orderId },
  };
  const checkout = loadServerModule<any>('app/api/hitpay/checkout/route.ts', dependencies, globals);
  const webhook = loadServerModule<any>('app/api/hitpay/webhook/route.ts', dependencies, globals);
  const pay = (payload: unknown) => checkout.POST(new Request('https://example.com/api/hitpay/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  const event = (overrides: any = {}) => ({ id: requestId, reference_number: orderId, status: 'completed', amount: ((row?.amount_minor ?? 3500) / 100).toFixed(2), currency: 'MYR', payments: [{ id: paymentId, status: 'succeeded', amount: ((row?.amount_minor ?? 3500) / 100).toFixed(2), currency: 'myr', refunded_amount: '0.00' }], ...overrides });
  const notify = (payload: unknown, headers: Record<string, string> = {}) => {
    const body = JSON.stringify(payload);
    return webhook.POST(new Request('https://example.com/api/hitpay/webhook', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Hitpay-Event-Object': 'payment_request', 'Hitpay-Event-Type': 'completed',
      'Hitpay-Signature': createHmac('sha256', env.HITPAY_WEBHOOK_SALT).update(body).digest('hex'), ...headers,
    }, body }));
  };
  return { pay, notify, event, calls, alerts, checkout, webhook, get row() { return row; }, get authCalls() { return authCalls; } };
}
import * as crypto from 'node:crypto';
function requireCrypto() { return crypto; }

test('HitPay signatures authenticate exact raw bytes and reject invalid encodings/lengths safely', () => {
  const { verifyHitPaySignature } = helper();
  const raw = Buffer.from('{ "amount": "35.00" }');
  const signature = createHmac('sha256', 'salt').update(raw).digest('hex');
  assert.equal(verifyHitPaySignature(raw, signature, 'salt'), true);
  assert.equal(verifyHitPaySignature(raw, signature.toUpperCase(), 'salt'), true);
  for (const value of [null, '', signature.slice(2), signature + '00', 'z'.repeat(64), 'sha256=' + signature]) assert.equal(verifyHitPaySignature(raw, value, 'salt'), false);
  assert.equal(verifyHitPaySignature(Buffer.from('{"amount":"35.00"}'), signature, 'salt'), false);
  assert.equal(verifyHitPaySignature(raw, signature, 'wrong-salt'), false);
});

test('checkout rejects malformed inputs and unsupported plans before privileged writes', async () => {
  for (const payload of [null, {}, { buyer_email: 'bad', plan: 'bundle' }, { buyer_email: 'owner@example.com', plan: 'extension' }, { buyer_email: 'a@b.com', plan: 'BUNDLE' }]) {
    const f = fixture(); assert.equal((await f.pay(payload)).status, 400); assert.equal(f.calls.length, 0);
  }
});

test('public plans use published prices, normalize email and create sandbox hosted checkout', async () => {
  for (const [plan, catalog] of [['bundle', 'bundle'], ['semester', 'mobile_notification'], ['yearly', 'mobile_notification_yearly']]) {
    const f = fixture(); const res = await f.pay({ buyer_email: ' Owner@Example.com ', plan, amount: 1 });
    assert.equal(res.status, 200); const result = await res.json(); assert.equal(result.reference, orderId); assert.match(result.url, /^https:\/\/securecheckout.sandbox.hit-pay.com\//);
    assert.equal(f.authCalls, 0); assert.equal(f.row.buyer_email, 'owner@example.com'); assert.equal(f.row.amount_minor, packagePrice(DEFAULT_SITE_CONFIG, catalog as any));
    assert.equal(f.row.status, 'pending'); assert.equal(f.row.provider_request_id, requestId);
    const provider = f.calls.find(call => call.provider); assert.equal(provider.provider, 'https://api.sandbox.hit-pay.com/v1/payment-requests');
    const body = JSON.parse(provider.init.body); assert.equal(body.reference_number, orderId); assert.equal(body.currency, 'MYR'); assert.equal(body.webhook, undefined);
    assert.equal(provider.init.headers['X-BUSINESS-API-KEY'], env.HITPAY_API_KEY);
  }
});

test('internal_check requires the admin session and costs exactly 100 minor units', async () => {
  const denied = fixture(); assert.equal((await denied.pay({ buyer_email: 'a@b.com', plan: 'internal_check' })).status, 403); assert.equal(denied.authCalls, 1); assert.equal(denied.calls.length, 0);
  const allowed = fixture({ admin: true }); assert.equal((await allowed.pay({ buyer_email: 'a@b.com', plan: 'internal_check' })).status, 200); assert.equal(allowed.authCalls, 1); assert.equal(allowed.row.amount_minor, 100);
});

test('disabled storefront checkout prevents provider calls and database writes', async () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG); config.settings.checkoutEnabled = false;
  const f = fixture({ config }); assert.equal((await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' })).status, 409); assert.equal(f.calls.length, 0);
});

test('provider failures preserve pending orders and expose no provider details', async () => {
  const f = fixture({ providerFail: true }); const res = await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' });
  assert.equal(res.status, 502); assert.equal(f.row.status, 'pending'); assert.equal(f.row.provider_request_id, null); assert.doesNotMatch(await res.text(), /private provider details/);
});

test('invalid webhook signatures fail before database access', async () => {
  const f = fixture(); assert.equal((await f.notify(f.event(), { 'Hitpay-Signature': '0'.repeat(64) })).status, 401); assert.equal(f.calls.length, 0);
});

test('valid payment binds the request, amount and transaction then calls the fulfillment RPC', async () => {
  const f = fixture(); await f.pay({ buyer_email: 'owner@example.com', plan: 'bundle' });
  assert.equal((await f.notify(f.event())).status, 200);
  assert.equal(f.row.provider_payment_id, paymentId); assert.ok(f.row.payment_confirmed_at); assert.equal(f.row.status, 'paid');
  const rpc = f.calls.find(call => call.rpc); assert.equal(rpc.rpc, 'assign_available_key'); assert.equal(rpc.args.p_order_id, orderId);
  const paymentWrite = f.calls.findIndex(call => call.values?.provider_payment_id); assert.ok(paymentWrite < f.calls.indexOf(rpc));
  assert.equal((await f.notify(f.event())).status, 200);
});

test('signed unsuccessful, refunded and unrelated events do not fulfill', async () => {
  const f = fixture();
  assert.equal((await f.notify(f.event({ status: 'failed' }), { 'Hitpay-Event-Type': 'failed' })).status, 200);
  assert.equal((await f.notify({ id: paymentId, status: 'refunded' }, { 'Hitpay-Event-Object': 'charge', 'Hitpay-Event-Type': 'updated' })).status, 200);
  assert.equal(f.calls.length, 0);
});

test('signed payment mismatches and invalid payloads never reach fulfillment', async () => {
  for (const override of [{ amount: '0.01' }, { currency: 'SGD' }, { id: paymentId }, { reference_number: paymentId }, { payments: [] }, { payments: [{ id: paymentId, status: 'succeeded', amount: '34.99', currency: 'myr' }] }, { payments: [{ id: paymentId, status: 'succeeded', amount: '35.00', currency: 'myr', refunded_amount: '1.00' }] }]) {
    const f = fixture(); await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' });
    assert.ok((await f.notify(f.event(override))).status >= 400); assert.equal(f.calls.some(call => call.rpc), false);
  }
});

test('inventory exhaustion is durably recorded, emits a critical alert and returns 200', async () => {
  const f = fixture({ rpcError: 'INVENTORY_EXHAUSTED' }); await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' });
  assert.equal((await f.notify(f.event())).status, 200); assert.equal(f.row.status, 'pending'); assert.equal(f.row.provider_payment_id, paymentId);
  assert.equal(f.row.fulfillment_error, 'INVENTORY_EXHAUSTED'); assert.ok(JSON.stringify(f.alerts).includes('INVENTORY_EXHAUSTED')); assert.ok(!JSON.stringify(f.alerts).includes('a@b.com'));
});

test('unexpected fulfillment and database failures return 500 to permit retries', async () => {
  const f = fixture({ rpcError: 'connection lost' }); await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' });
  assert.equal((await f.notify(f.event())).status, 500); assert.equal(f.row.provider_payment_id, paymentId);
  const unavailable = fixture({ dbError: true }); assert.equal((await unavailable.pay({ buyer_email: 'a@b.com', plan: 'bundle' })).status, 500); assert.equal(unavailable.calls.some(call => call.provider), false);
});

test('a different transaction cannot overwrite a previously captured payment', async () => {
  const f = fixture(); await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' }); await f.notify(f.event());
  const before = f.calls.filter(call => call.rpc).length;
  assert.equal((await f.notify(f.event({ payments: [{ id: requestId, status: 'succeeded', amount: (f.row.amount_minor / 100).toFixed(2), currency: 'MYR' }] }))).status, 409);
  assert.equal(f.row.provider_payment_id, paymentId); assert.equal(f.calls.filter(call => call.rpc).length, before);
});

test('unconfigured checkout and webhook fail closed without database or provider access', async () => {
  for (const settings of [{ HITPAY_ENABLED: 'false' }, { HITPAY_ENVIRONMENT: 'production' }, { HITPAY_API_KEY: '' }]) {
    const f = fixture({ env: settings }); assert.equal((await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' })).status, 503); assert.equal(f.calls.length, 0);
  }
  const f = fixture({ env: { HITPAY_WEBHOOK_SALT: '' } }); assert.equal((await f.notify(f.event())).status, 503); assert.equal(f.calls.length, 0);
});

test('checkout rejects untrusted hosted URLs even in a successful provider response', async () => {
  for (const providerURL of ['https://evil.example/checkout', 'https://securecheckout.sandbox.hit-pay.com.evil.example/checkout', 'http://securecheckout.sandbox.hit-pay.com/checkout', 'https://username@securecheckout.sandbox.hit-pay.com/checkout']) {
    const f = fixture({ providerURL }); assert.equal((await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' })).status, 502); assert.equal(f.row.provider_request_id, null);
  }
});

test('charge.created binds to the saved request even without an embedded reference', async () => {
  const f = fixture(); await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' });
  assert.equal((await f.notify({ id: paymentId, status: 'succeeded', payment_request_id: requestId, payment_request: null, amount: f.row.amount_minor / 100, currency: 'myr', refunded_amount: 0 }, { 'Hitpay-Event-Object': 'charge', 'Hitpay-Event-Type': 'created' })).status, 200);
  assert.equal(f.row.status, 'paid'); assert.equal(f.row.provider_payment_id, paymentId);
  const pos = fixture(); assert.equal((await pos.notify({ id: paymentId, status: 'succeeded', payment_request_id: null }, { 'Hitpay-Event-Object': 'charge', 'Hitpay-Event-Type': 'created' })).status, 200); assert.equal(pos.calls.length, 0);
});

test('simultaneous identical callbacks preserve capture identity and both fulfill idempotently', async () => {
  const f = fixture(); await f.pay({ buyer_email: 'a@b.com', plan: 'bundle' });
  const replies = await Promise.all([f.notify(f.event()), f.notify(f.event())]);
  assert.deepEqual(replies.map(reply => reply.status), [200, 200]); assert.equal(f.row.provider_payment_id, paymentId); assert.equal(f.row.status, 'paid');
});

test('body limits, JSON parsing and decimal amount parsing reject malformed input', async () => {
  const f = fixture();
  assert.equal((await f.checkout.POST(new Request('https://example.com/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(16_385) }))).status, 413);
  assert.equal((await f.checkout.POST(new Request('https://example.com/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await f.checkout.POST(new Request('https://example.com/api', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await f.webhook.POST(new Request('https://example.com/api', { method: 'POST', body: 'x'.repeat(262_145) }))).status, 413); assert.equal(f.calls.length, 0);
  const { hitPayMinorAmount } = helper(); assert.equal(hitPayMinorAmount('1.01'), 101); assert.equal(hitPayMinorAmount(1), 100); assert.equal(hitPayMinorAmount('0.10'), 10);
  for (const value of ['1.001', '1e2', '-1', ' 1.00', null, NaN]) assert.throws(() => hitPayMinorAmount(value));
});

test('commerce client requires a server-only service key and forces uncached requests', async () => {
  let captured: any;
  const fetches: any[] = [];
  const make = (values: Record<string, string | undefined>) => loadServerModule<any>('lib/supabase/commerce.ts', {
    '@supabase/supabase-js': { createClient: (...args: any[]) => { captured = args; return {}; } },
  }, { process: { env: { NODE_ENV: 'production', ...values } }, fetch: async (...args: any[]) => { fetches.push(args); return new Response(); } });
  for (const values of [{}, { SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }, { SUPABASE_URL: 'http://evil.example', SUPABASE_SERVICE_ROLE_KEY: 'service' }]) assert.throws(() => make(values).getCommerceDatabase());
  make({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' }).getCommerceDatabase();
  assert.equal(captured[1], 'service'); assert.equal(captured[2].auth.persistSession, false);
  await captured[2].global.fetch('https://example.supabase.co/rest/v1/orders', { cache: 'force-cache' }); assert.equal(fetches[0][1].cache, 'no-store');
});
