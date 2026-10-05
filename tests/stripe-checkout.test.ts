import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import Stripe from 'stripe';
import { loadServerModule } from './helpers/server-module';
import { DEFAULT_SITE_CONFIG, packagePrice, purchaseAllowed } from '../lib/site-config';
import { isPaymentCheckoutURL } from '../lib/payment-checkout';

const orderId = 'fbbd355f-e574-4d1a-82cd-dfbd62c8ac64';
const secret = 'whsec_test_fixture';
const sdk = new Stripe('sk_test_fixture');
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: secret, APP_URL: 'https://auto-check.example' };

function fixture(options: { config?: typeof DEFAULT_SITE_CONFIG; providerFail?: boolean; env?: Partial<typeof env>; amount?: number; rpcError?: string; dbError?: boolean } = {}) {
  assert.ok(existsSync('app/api/checkout/stripe/route.ts'), 'Stripe session endpoint is missing');
  const calls: any[] = [];
  let row: any = null;
  const db = {
    from: () => {
      let operation = 'select', values: any;
      const filters: Array<[string, unknown]> = [];
      const query: any = {
        insert: (value: any) => { operation = 'insert'; values = value; return query; },
        update: (value: any) => { operation = 'update'; values = value; return query; },
        select: () => query, maybeSingle: () => query,
        eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
        is: (field: string, value: unknown) => { filters.push([field, value]); return query; },
        then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          calls.push({ operation, values, filters });
          if (options.dbError) return { data: null, error: { message: 'private database failure' } };
          if (operation === 'insert') row = { ...values, provider_payment_id: null, payment_confirmed_at: null };
          const matches = row && filters.every(([field, value]) => row[field] === value);
          if (matches && operation === 'update') Object.assign(row, values);
          return { data: matches ? { ...row } : null, error: null };
        }).then(resolve, reject),
      };
      return query;
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ rpc: name, args });
      if (options.rpcError) return { data: null, error: { message: options.rpcError } };
      row.status = 'paid';
      return { data: row.plan === 'extension' ? null : 'issued-license', error: null };
    },
  };
  const stripe = {
    checkout: { sessions: { create: async (params: unknown, settings: unknown) => {
      calls.push({ provider: params, settings });
      if (options.providerFail) throw new Error('private stripe credentials');
      return { id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/cs_test_fixture' };
    } } },
    webhooks: sdk.webhooks,
  };
  const server = loadServerModule<any>('lib/stripe-server.ts', {
    stripe: class { constructor() { return stripe; } },
  }, { Request, Response, AbortSignal, process: { env: { ...env, ...options.env } }, console: { error: () => {} } });
  const fulfillment = loadServerModule<any>('lib/stripe-fulfillment.ts', {
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db },
    '@/lib/stripe-server': server,
    './stripe-server': server,
  }, { console: { error: () => {} } });
  const deps = {
    'node:crypto': { randomUUID: () => orderId },
    '@/lib/stripe-server': server,
    '@/lib/stripe-fulfillment': fulfillment,
    '@/lib/payment-checkout': { isPaymentCheckoutURL },
    '@/lib/site-settings': { getPublishedSiteConfig: async () => options.config ?? DEFAULT_SITE_CONFIG },
    '@/lib/site-config': { packagePrice, purchaseAllowed },
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db },
  };
  const globals = { Request, Response, AbortSignal, process: { env: { ...env, ...options.env } }, console: { error: () => {} } };
  const route = loadServerModule<any>('app/api/checkout/stripe/route.ts', deps, globals);
  const webhook = loadServerModule<any>('app/api/checkout/stripe/webhook/route.ts', deps, globals);
  return {
    calls, get row() { return row; },
    pay: (body: unknown, origin = 'https://auto-check.example') => route.POST(new Request('https://auto-check.example/api/checkout/stripe', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
    })),
    notify: (overrides: Record<string, unknown> = {}, validSignature = true, type = 'checkout.session.completed') => {
      const payload = JSON.stringify({ id: 'evt_test', type, data: { object: {
        id: 'cs_test_fixture', client_reference_id: orderId, mode: 'payment', status: 'complete',
        payment_status: 'paid', payment_intent: 'pi_test_fixture', currency: 'myr',
        amount_total: options.amount ?? row.amount_minor, ...overrides,
      } } });
      const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: validSignature ? secret : 'whsec_wrong' });
      return webhook.POST(new Request('https://auto-check.example/api/checkout/stripe/webhook', {
        method: 'POST', headers: { 'Stripe-Signature': signature }, body: payload,
      }));
    },
  };
}

test('Stripe sessions use server prices, normalize email and enable card plus FPX', async () => {
  for (const [plan, catalog] of [['bundle', 'bundle'], ['extension', 'extension'], ['semester', 'mobile_notification'], ['yearly', 'mobile_notification_yearly']] as const) {
    const f = fixture(); const response = await f.pay({ plan, buyer_email: ' Buyer@Example.com ', amount: 1 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: 'https://checkout.stripe.com/c/pay/cs_test_fixture', reference: orderId });
    assert.equal(f.row.buyer_email, 'buyer@example.com');
    assert.equal(f.row.payment_provider, 'stripe');
    assert.equal(f.row.provider_request_id, 'cs_test_fixture');
    const { provider, settings } = f.calls.find(call => call.provider);
    assert.equal(provider.line_items[0].price_data.unit_amount, packagePrice(DEFAULT_SITE_CONFIG, catalog));
    assert.equal(provider.line_items[0].price_data.currency, 'myr');
    assert.deepEqual(Array.from(provider.allowed_payment_method_types), ['card', 'fpx']);
    assert.equal(provider.success_url, `https://auto-check.example/success?order_id=${orderId}`);
    assert.equal(provider.cancel_url, 'https://auto-check.example/#pricing');
    assert.equal(settings.idempotencyKey, `checkout-${orderId}`);
  }
});

test('invalid Stripe input, foreign origins and disabled packages never reach the provider', async () => {
  for (const input of [null, {}, { plan: 'internal_check', buyer_email: 'a@b.com' }, { plan: 'bundle', buyer_email: 'invalid' }]) {
    const f = fixture(); assert.equal((await f.pay(input)).status, 400); assert.equal(f.calls.length, 0);
  }
  const foreign = fixture(); assert.equal((await foreign.pay({ plan: 'bundle', buyer_email: 'a@b.com' }, 'https://attacker.example')).status, 403);
  assert.equal(foreign.calls.length, 0);
  const config = structuredClone(DEFAULT_SITE_CONFIG); config.settings.checkoutEnabled = false;
  const unavailable = fixture({ config }); assert.equal((await unavailable.pay({ plan: 'bundle', buyer_email: 'a@b.com' })).status, 409);
  assert.equal(unavailable.calls.length, 0);
});

test('Stripe requires both server credentials and payment confirmation configuration', async () => {
  for (const missing of [{ STRIPE_SECRET_KEY: '' }, { STRIPE_WEBHOOK_SECRET: '' }]) {
    const f = fixture({ env: missing });
    assert.equal((await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' })).status, 503);
    assert.equal(f.calls.length, 0);
  }
});

test('provider and database failures do not return private details or a payment URL', async () => {
  for (const options of [{ providerFail: true }, { dbError: true }]) {
    const f = fixture(options); const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
    assert.ok(response.status >= 500); assert.doesNotMatch(await response.text(), /private|credentials|https:/);
  }
});

test('Stripe signatures and exact payment amounts are verified before fulfillment', async () => {
  const invalid = fixture(); await invalid.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  const before = invalid.calls.length; assert.equal((await invalid.notify({}, false)).status, 401);
  assert.equal(invalid.calls.length, before);
  for (const bad of [{ amount_total: 1 }, { currency: 'usd' }, { client_reference_id: 'different-order' }]) {
    const f = fixture(); await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
    assert.equal((await f.notify(bad)).status, 409);
    assert.equal(f.calls.filter(call => call.rpc).length, 0);
    assert.equal(f.row.payment_confirmed_at, null);
  }
});

test('paid Stripe callbacks persist capture and fulfill safely on duplicate delivery', async () => {
  const f = fixture(); await f.pay({ plan: 'extension', buyer_email: 'a@b.com' });
  assert.equal((await f.notify()).status, 200);
  assert.equal((await f.notify()).status, 200);
  assert.equal(f.row.provider_payment_id, 'pi_test_fixture');
  assert.ok(f.row.payment_confirmed_at); assert.equal(f.row.status, 'paid');
  assert.equal(f.calls.filter(call => call.operation === 'update' && call.values.provider_payment_id).length, 1);
});

test('unpaid Stripe sessions wait for asynchronous confirmation and stock failures preserve capture', async () => {
  const pending = fixture(); await pending.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  assert.equal((await pending.notify({ payment_status: 'unpaid', payment_intent: null })).status, 200);
  assert.equal(pending.row.payment_confirmed_at, null);
  assert.equal((await pending.notify({}, true, 'checkout.session.async_payment_succeeded')).status, 200);
  assert.equal(pending.row.status, 'paid');
  const stock = fixture({ rpcError: 'INVENTORY_EXHAUSTED' }); await stock.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  assert.equal((await stock.notify()).status, 200);
  assert.equal(stock.row.status, 'pending'); assert.ok(stock.row.payment_confirmed_at);
  assert.equal(stock.row.fulfillment_error, 'INVENTORY_EXHAUSTED');
});
