import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadServerModule } from './helpers/server-module';
import { DEFAULT_SITE_CONFIG, packagePrice, purchaseAllowed } from '../lib/site-config';

const orderId = 'fbbd355f-e574-4d1a-82cd-dfbd62c8ac64';
const env = {
  APP_URL: 'https://auto-check.example',
  TOYYIBPAY_SECRET_KEY: 'toyyib_fake_secret_value',
  TOYYIBPAY_CATEGORY_CODE: 'fake_category',
};

function fixture(options: { providerFail?: boolean; providerBody?: string; contentType?: string; validatePayorInfo?: boolean; env?: Partial<typeof env> } = {}) {
  assert.ok(existsSync('app/api/checkout/toyyibpay/route.ts'));
  const calls: unknown[] = [];
  const logs: unknown[][] = [];
  const db = {
    from: () => {
      let operation = 'insert';
      let values: Record<string, unknown> = {};
      const query: any = {
        insert: (value: Record<string, unknown>) => { operation = 'insert'; values = value; return query; },
        update: (value: Record<string, unknown>) => { operation = 'update'; values = value; return query; },
        select: () => query, maybeSingle: () => query,
        eq: () => query, is: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve().then(() => ({
          data: operation === 'update' ? { id: orderId, ...values } : null, error: null,
        })).then(resolve),
      };
      return query;
    },
  };
  const globals = {
    Request, Response, AbortSignal, URLSearchParams,
    process: { env: { ...env, ...options.env } },
    console: { error: (...args: unknown[]) => logs.push(args) },
    fetch: async (_input: unknown, init: RequestInit) => {
      calls.push(true);
      const fields = new URLSearchParams(String(init.body));
      if (options.validatePayorInfo && fields.get('billPayorInfo') === '1') {
        const missingField = ['billTo', 'billPhone'].find(field => !fields.get(field));
        if (missingField) {
          return new Response(JSON.stringify({ status: 'error', msg: `${missingField} parameter is empty` }), {
            status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' },
          });
        }
      }
      const body = options.providerBody ?? (options.providerFail
        ? JSON.stringify({ message: 'private provider URL https://evil.example and secret toyyib_fake_secret_value' })
        : JSON.stringify([{ BillCode: 'bill_fixture' }]));
      return new Response(body, {
        status: options.providerFail ? 503 : 200,
        headers: { 'Content-Type': options.contentType ?? 'application/json' },
      });
    },
  };
  const deps = {
    'node:crypto': { randomUUID: () => orderId },
    '@/lib/site-settings': { getPublishedSiteConfig: async () => DEFAULT_SITE_CONFIG },
    '@/lib/site-config': { packagePrice, purchaseAllowed },
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db },
  };
  const route = loadServerModule<any>('app/api/checkout/toyyibpay/route.ts', deps, globals);
  return {
    calls, logs,
    pay: (body: unknown) => route.POST(new Request('https://auto-check.example/api/checkout/toyyibpay', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://auto-check.example' }, body: JSON.stringify(body),
    })),
  };
}

test('ToyyibPay creates an open bill for every plan using only the storefront email', async () => {
  for (const plan of ['bundle', 'extension', 'semester', 'yearly']) {
    const f = fixture({ validatePayorInfo: true });
    const response = await f.pay({ plan, buyer_email: 'a@b.com' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: 'https://toyyibpay.com/bill_fixture', reference: orderId });
    assert.equal(f.calls.length, 1);
    assert.equal(f.logs.length, 0);
  }
});

test('ToyyibPay reports a provider msg without changing the browser error response', async () => {
  const f = fixture({
    providerBody: '{"status":"error","msg":"billTo parameter is empty"}',
    contentType: 'text/html; charset=UTF-8',
  });
  const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'TOYYIBPAY_PROVIDER_REJECTED' });
  const diag = JSON.parse(String(f.logs[0][1]));
  assert.equal(diag.stage, 'createBill.response_validation');
  assert.equal(diag.message, 'billTo parameter is empty');
});

test('ToyyibPay provider diagnostics preserve the response and redact secrets and URLs', async () => {
  const f = fixture({ providerFail: true });
  const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  assert.equal(response.status, 502, JSON.stringify(f.logs));
  assert.deepEqual(await response.json(), { error: 'TOYYIBPAY_PROVIDER_UNAVAILABLE' });
  const text = JSON.stringify(f.logs);
  assert.match(text, /\[checkout-diag\]/);
  assert.match(text, /production/);
  assert.doesNotMatch(text, /toyyib_fake_secret_value|https:\/\/evil\.example|a@b\.com/);
});

test('ToyyibPay configuration diagnostics preserve the response', async () => {
  const f = fixture({ env: { TOYYIBPAY_SECRET_KEY: undefined } });
  const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'TOYYIBPAY_NOT_CONFIGURED' });
  const text = JSON.stringify(f.logs);
  assert.match(text, /TOYYIBPAY_SECRET_MISSING/);
  assert.doesNotMatch(text, /toyyib_fake_secret_value|https:\/\/auto-check\.example|a@b\.com/);
});

test('ToyyibPay accepts JSON in text/html with a leading BOM and surrounding newlines', async () => {
  for (const body of [
    '[{"BillCode":"gdgwqt9r"}]',
    '\uFEFF[{"BillCode":"gdgwqt9r"}]',
    '\n[{"BillCode":"gdgwqt9r"}]\r\n',
    '\uFEFF\n{"BillCode":"gdgwqt9r"}\n',
  ]) {
    const f = fixture({ providerBody: body, contentType: 'text/html; charset=UTF-8' });
    const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
    assert.equal(response.status, 200, JSON.stringify(f.logs));
    assert.deepEqual(await response.json(), { url: 'https://toyyibpay.com/gdgwqt9r', reference: orderId });
    assert.equal(f.logs.length, 0);
  }
});

test('ToyyibPay rejects missing or empty BillCode with the existing browser response', async () => {
  for (const body of ['{}', '{"BillCode":""}', '[{"BillCode":""}]']) {
    const f = fixture({ providerBody: body, contentType: 'text/html; charset=UTF-8' });
    const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'TOYYIBPAY_PROVIDER_REJECTED' });
    const diag = JSON.parse(String(f.logs.find(args => JSON.stringify(args).includes('createBill.response_validation'))?.[1]));
    assert.equal(diag.contentType, 'text/html; charset=UTF-8');
    assert.equal(diag.responseBytes, Buffer.byteLength(body, 'utf8'));
    assert.equal(diag.jsonParsable, true);
    assert.equal(diag.topLevelType, body.startsWith('[') ? 'array' : 'object');
    assert.equal(diag.firstCodePoint, body.codePointAt(0));
  }
});

test('ToyyibPay validation logs response shape and redacted preview for provider error JSON', async () => {
  const body = JSON.stringify({ status: 'error', msg: 'toyyib_fake_secret_value fake_category a@b.com https://evil.example/path' });
  const f = fixture({ providerBody: body, contentType: 'text/html; charset=UTF-8' });
  const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'TOYYIBPAY_PROVIDER_REJECTED' });
  const diag = JSON.parse(String(f.logs.find(args => JSON.stringify(args).includes('createBill.response_validation'))?.[1]));
  assert.equal(diag.jsonParsable, true);
  assert.equal(diag.topLevelType, 'object');
  assert.deepEqual(Array.from(diag.topLevelKeys), ['status', 'msg']);
  assert.equal(diag.message, '[redacted-secret] [redacted-category] [redacted-email] [redacted-url]');
  assert.match(diag.responsePrefix, /redacted-secret|redacted-category/);
  const text = JSON.stringify(f.logs);
  assert.doesNotMatch(text, /toyyib_fake_secret_value|fake_category|a@b\.com|https:\/\/evil\.example|https:\/\/auto-check\.example/);
});

test('ToyyibPay diagnostic preserves the BOM code point and original byte count', async () => {
  const f = fixture({ providerBody: '\uFEFF{}', contentType: 'text/html; charset=UTF-8' });
  const response = await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'TOYYIBPAY_PROVIDER_REJECTED' });
  const diag = JSON.parse(String(f.logs.find(args => JSON.stringify(args).includes('createBill.response_validation'))?.[1]));
  assert.equal(diag.firstCodePoint, 0xfeff);
  assert.equal(diag.responseBytes, 5);
  assert.equal(diag.jsonParsable, true);
});

test('ToyyibPay preview redacts JSON escaped URLs before logging', async () => {
  const f = fixture({ providerBody: '{"status":"error","msg":"https:\\/\\/evil.example\\/path"}' });
  await f.pay({ plan: 'bundle', buyer_email: 'a@b.com' });
  const diag = JSON.parse(String(f.logs.find(args => JSON.stringify(args).includes('createBill.response_validation'))?.[1]));
  assert.doesNotMatch(diag.responsePrefix, /evil\.example/);
});
