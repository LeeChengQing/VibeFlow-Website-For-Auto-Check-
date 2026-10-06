import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadServerModule } from './helpers/server-module';
import { DEFAULT_SITE_CONFIG } from '../lib/site-config';
import { CURRENT_TERMS_VERSION } from '../lib/consent';
import { generateOrderAccessToken, verifyOrderAccessToken } from '../lib/order-access-token';

const orderId = 'a1111111-2222-3333-4444-555555555555';
const env = {
  APP_URL: 'https://auto-check.example',
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_fake',
  TOYYIBPAY_SECRET_KEY: 'toyyib_fake_secret',
  TOYYIBPAY_CATEGORY_CODE: 'fake_category',
};

function setupStripeRoute(options: { isProduction?: boolean } = {}) {
  let insertedOrder: Record<string, unknown> | null = null;
  let sessionParams: any = null;

  const db = {
    from: () => {
      let operation = 'select';
      const query: any = {
        insert: (row: Record<string, unknown>) => {
          operation = 'insert';
          insertedOrder = { ...row };
          return query;
        },
        update: (row: Record<string, unknown>) => {
          operation = 'update';
          if (insertedOrder) Object.assign(insertedOrder, row);
          return query;
        },
        select: () => query,
        eq: () => query,
        then: (resolve: any) => Promise.resolve({ data: insertedOrder, error: null }).then(resolve),
      };
      return query;
    },
  };

  const stripe = {
    checkout: {
      sessions: {
        create: async (params: any) => {
          sessionParams = params;
          return { id: 'cs_test_session', url: 'https://checkout.stripe.com/c/pay/cs_test_session' };
        },
      },
    },
  };

  const server = loadServerModule<any>('lib/stripe-server.ts', {
    stripe: class { constructor() { return stripe; } },
  }, { Request, Response, AbortSignal, process: { env } });

  const route = loadServerModule<any>('app/api/checkout/stripe/route.ts', {
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db },
    '@/lib/stripe-server': server,
    '@/lib/site-settings': { getPublishedSiteConfig: async () => DEFAULT_SITE_CONFIG },
  }, {
    Request, Response, AbortSignal,
    process: { env: { ...env, NODE_ENV: options.isProduction ? 'production' : 'test' } },
  });

  return {
    post: (body: unknown, headers: Record<string, string> = {}) => route.POST(new Request('https://auto-check.example/api/checkout/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://auto-check.example',
        'User-Agent': 'TestBrowser/1.0',
        'X-Forwarded-For': '203.0.113.195',
        ...headers,
      },
      body: JSON.stringify(body),
    })),
    get insertedOrder() { return insertedOrder; },
    get sessionParams() { return sessionParams; },
  };
}

test('Stripe checkout rejects when terms_accepted is false', async () => {
  const fixture = setupStripeRoute();
  const response = await fixture.post({
    plan: 'bundle',
    buyer_email: 'buyer@example.com',
    terms_accepted: false,
    terms_version: CURRENT_TERMS_VERSION,
  });
  assert.equal(response.status, 400);
  assert.equal(fixture.insertedOrder, null);
});

test('Stripe checkout rejects mismatched terms_version', async () => {
  const fixture = setupStripeRoute();
  const response = await fixture.post({
    plan: 'bundle',
    buyer_email: 'buyer@example.com',
    terms_accepted: true,
    terms_version: '2023-01-01',
  });
  assert.equal(response.status, 400);
  assert.equal(fixture.insertedOrder, null);
});

test('Stripe checkout records terms consent and capability access token', async () => {
  const fixture = setupStripeRoute();
  const response = await fixture.post({
    plan: 'bundle',
    buyer_email: 'buyer@example.com',
    terms_accepted: true,
    terms_version: CURRENT_TERMS_VERSION,
  });

  assert.equal(response.status, 200);
  assert.ok(fixture.insertedOrder);
  assert.equal(fixture.insertedOrder.terms_version, CURRENT_TERMS_VERSION);
  assert.ok(fixture.insertedOrder.terms_accepted_at);
  assert.match(fixture.insertedOrder.consent_ip_hash as string, /^[a-f0-9]{64}$/);
  assert.equal(fixture.insertedOrder.consent_ua, 'TestBrowser/1.0');
  assert.match(fixture.insertedOrder.order_access_token_hash as string, /^[a-f0-9]{64}$/);

  // Return URL includes the capability token
  assert.ok(fixture.sessionParams);
  const successUrl = new URL(fixture.sessionParams.success_url);
  const token = successUrl.searchParams.get('token');
  assert.ok(token, 'success_url must include token parameter');
  assert.equal(
    verifyOrderAccessToken(token, fixture.insertedOrder.order_access_token_hash as string),
    true,
    'Returned token must match stored hash'
  );
});

test('Success page security: bare order UUID without token cannot view license key', async () => {
  const { token, tokenHash } = generateOrderAccessToken();
  const testLicenseKey = 'TEST-KEY-SECURE-12345';

  let selectCallCount = 0;
  const db = {
    from: (table: string) => {
      const query: any = {
        select: () => query,
        in: () => query,
        eq: (col: string, val: unknown) => query,
        abortSignal: () => query,
        maybeSingle: async () => {
          selectCallCount++;
          if (table === 'orders') {
            return {
              data: {
                id: orderId,
                reference: orderId,
                status: 'paid',
                payment_confirmed_at: '2026-10-06T12:00:00Z',
                plan: 'extension',
                amount_minor: 2499,
                buyer_email: 'student@example.edu',
                payment_provider: 'stripe',
                order_access_token_hash: tokenHash,
              },
              error: null,
            };
          }
          if (table === 'issued_licenses') {
            return {
              data: { inventory_id: 'inv-123', plan_type: 'core' },
              error: null,
            };
          }
          if (table === 'key_inventory') {
            return {
              data: {
                encrypted_key: 'enc-data',
                key_hash: 'hash-data',
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return query;
    },
  };

  const successPageModule = loadServerModule<any>('app/success/page.tsx', {
    'next/headers': {
      headers: async () => new Headers({ 'user-agent': 'Desktop/1.0' }),
    },
    '@/lib/hitpay': {
      isHitPayUUID: (id: unknown) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    },
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db },
    '@/lib/license-key-encryption': { decryptLicenseKey: () => testLicenseKey },
    '@/components/PaymentReturn': {
      PaymentReturn: (props: any) => ({ type: 'PaymentReturn', props }),
    },
    '@/components/MinimalPaymentReturn': {
      MinimalPaymentReturn: (props: any) => ({ type: 'MinimalPaymentReturn', props }),
    },
  }, {
    headers: async () => new Headers({ 'user-agent': 'Desktop/1.0' }),
  });

  // 1. Visit with bare order_id and NO token
  const unauthorizedResult = await successPageModule.default({
    searchParams: Promise.resolve({ order_id: orderId }),
  });

  assert.equal(unauthorizedResult.props.licenseKey, undefined, 'License key must NOT leak to bare order_id URL');
  assert.equal(unauthorizedResult.props.downloadExtension, false, 'Download must not be granted without token');

  // 2. Visit with valid token
  const authorizedResult = await successPageModule.default({
    searchParams: Promise.resolve({ order_id: orderId, token }),
  });

  assert.equal(authorizedResult.props.licenseKey, testLicenseKey, 'License key should be provided when token is valid');
  assert.equal(authorizedResult.props.downloadExtension, true, 'Download granted when authorized');
});

test('ToyyibPay checkout validates consent and sets return URL token', async () => {
  let insertedOrder: any = null;
  let postedBody: URLSearchParams | null = null;
  const db = {
    from: () => {
      const q: any = {
        insert: (row: any) => { insertedOrder = row; return q; },
        update: () => q,
        eq: () => q,
        is: () => q,
        select: () => q,
        maybeSingle: async () => ({ data: { id: 'order_fixture' }, error: null }),
        then: (resolve: any) => Promise.resolve({ data: insertedOrder, error: null }).then(resolve),
      };
      return q;
    },
  };

  const toyyibpayRoute = loadServerModule<any>('app/api/checkout/toyyibpay/route.ts', {
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db },
    '@/lib/site-settings': { getPublishedSiteConfig: async () => DEFAULT_SITE_CONFIG },
  }, {
    fetch: async (_url: string, init: RequestInit) => {
      postedBody = new URLSearchParams(String(init.body));
      return new Response(JSON.stringify([{ BillCode: 'bill_test_123' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    process: { env },
    console: { error: (...args: any[]) => console.log('TOYYIB ERROR:', ...args) },
  });

  // Rejects when terms_accepted is false
  const rejected = await toyyibpayRoute.POST(new Request('https://auto-check.example/api/checkout/toyyibpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://auto-check.example' },
    body: JSON.stringify({ plan: 'bundle', buyer_email: 'toyyib@example.com', terms_accepted: false }),
  }));
  assert.equal(rejected.status, 400);

  // Accepts when terms_accepted is true
  const res = await toyyibpayRoute.POST(new Request('https://auto-check.example/api/checkout/toyyibpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://auto-check.example',
      'User-Agent': 'MobileBuyer/2.0',
      'X-Forwarded-For': '198.51.100.12',
    },
    body: JSON.stringify({
      plan: 'bundle',
      buyer_email: 'toyyib@example.com',
      terms_accepted: true,
      terms_version: CURRENT_TERMS_VERSION,
    }),
  }));
  assert.equal(res.status, 200);
  assert.ok(insertedOrder);
  assert.equal(insertedOrder.terms_version, CURRENT_TERMS_VERSION);
  assert.ok(insertedOrder.order_access_token_hash);
  assert.equal(insertedOrder.consent_ua, 'MobileBuyer/2.0');
  assert.ok(postedBody);
  const billReturnUrl = new URL(postedBody.get('billReturnUrl')!);
  const token = billReturnUrl.searchParams.get('token');
  assert.ok(token);
  assert.equal(verifyOrderAccessToken(token, insertedOrder.order_access_token_hash), true);
});

