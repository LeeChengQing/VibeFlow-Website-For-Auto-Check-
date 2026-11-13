import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadServerModule} from './helpers/server-module';

const id = '00000000-0000-4000-8000-000000000001';
const origin = 'https://checkout.example.invalid';

test('paid fulfillment sends the order URL once and tolerates mail failure', async () => {
  let claimed = false;
  let failMail = false;
  let sends = 0;
  let result = {ok: true};
  const logs: unknown[] = [];
  const db = {
    rpc: async () => ({data: result}),
    from: (table: string) => {
      assert.equal(table, 'payment_events');
      return {
        upsert(event: {event_id: string}, options: unknown) {
          assert.equal(event.event_id, 'order-email:' + id);
          assert.deepEqual(JSON.parse(JSON.stringify(options)), {onConflict: 'provider,event_id', ignoreDuplicates: true});
          return {select: async () => {
            if (claimed) return {data: []};
            claimed = true;
            return {data: [{event_id: event.event_id}]};
          }};
        },
        update: () => ({eq: () => ({eq: async () => ({error: null})})}),
      };
    },
  };
  const {fulfillUnifiedOrder} = loadServerModule<typeof import('../lib/unified-commerce')>('lib/unified-commerce.ts', {
    '@/lib/order-access-token': {},
    '@/lib/site-settings': {},
    '@/lib/site-config': {},
    '@/lib/supabase/commerce': {getCommerceDatabase: () => db},
    '@/lib/stripe-server': {},
    '@/lib/license-key-encryption': {encryptLicenseKey: () => 'fixture-ciphertext'},
    '@/lib/plugin-license-key': {generatePluginLicenseKey: () => 'fixture-license'},
    '@/lib/payments/provider-status': {},
    '@/lib/mail/email-service': {ResendEmailAdapter: class {
      async sendOrderLinkEmail(to: string, orderId: string, orderUrl: string) {
        sends++;
        assert.equal(to, 'buyer@example.invalid');
        assert.equal(orderId, id);
        assert.equal(orderUrl, origin + '/success?order_id=' + id);
        if (failMail) throw Error('fixture failure');
      }
    }},
  }, {process: {env: {APP_URL: origin}}, console: {error: (data: unknown) => logs.push(data)}});
  const order = {id, payment_provider: 'stripe', buyer_email: 'buyer@example.invalid'};
  const fulfill = () => fulfillUnifiedOrder(order, 'fixture-payment', 2499, 'MYR');
  await Promise.all([fulfill(), fulfill()]);
  assert.equal(sends, 1);
  claimed = false;
  failMail = true;
  assert.equal((await fulfill()).ok, true);
  await fulfill();
  assert.equal(sends, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(logs)), [{stage: 'order_email', code: 'ORDER_EMAIL_FAILED'}]);
  result = {ok: false};
  claimed = false;
  await fulfill();
  assert.equal(sends, 2);
});

test('order email contains only the order URL and an order-scoped idempotency key', async () => {
  const orderUrl = origin + '/success?order_id=' + id;
  let sent: RequestInit | undefined;
  const {ResendEmailAdapter} = loadServerModule<typeof import('../lib/mail/email-service')>('lib/mail/email-service.ts', {}, {
    fetch: async (_url: string, init: RequestInit) => {
      sent = init;
      return new Response(null, {status: 200});
    },
  });
  await new ResendEmailAdapter('fixture-api-key', 'sender@example.invalid').sendOrderLinkEmail('buyer@example.invalid', id, orderUrl);
  assert.equal(new Headers(sent?.headers).get('Idempotency-Key'), 'order-email:' + id);
  const body = JSON.parse(String(sent?.body));
  assert.equal(body.text, orderUrl);
  assert.equal(body.html, undefined);
});

test('plugin APIs return generic responses for absent tables or RPCs', async () => {
  let errorCode = 'PGRST200';
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({maybeSingle: async () => ({error: {code: errorCode}})}),
        limit: async () => ({error: {code: errorCode}}),
      }),
    }),
    rpc: async () => ({error: {code: errorCode}}),
  };
  const core = {
    commerceDatabase: () => db,
    commerceOrigin: () => origin,
    isOrderId: () => true,
    ownedUnifiedOrder: async () => ({id, order_access_token_hash: 'fixture'}),
    reply: (body: unknown, status = 200) => Response.json(body, {status}),
  };
  const plugins = loadServerModule<typeof import('../lib/plugin-download')>('lib/plugin-download.ts', {
    '@/lib/canonical-commerce': {},
    '@/lib/order-access-token': {generateOrderAccessToken: () => ({}), hashOrderAccessToken: () => 'fixture'},
    '@/lib/stripe-server': {readStripeBody: async () => Buffer.from(JSON.stringify({orderId: id}))},
    '@/lib/unified-commerce': core,
  });
  const latest = loadServerModule<typeof import('../app/api/plugin/latest/route')>('app/api/plugin/latest/route.ts', {
    '@/lib/plugin-download': plugins,
    '@/lib/unified-commerce': core,
  });
  assert.equal((await latest.GET()).status, 404);
  errorCode = 'PGRST202';
  const request = new Request(origin, {headers: {origin, 'content-type': 'application/json'}});
  assert.equal((await plugins.issuePluginDownload(request)).status, 403);
  assert.equal((await plugins.redeemPluginDownload(request, 'a'.repeat(43))).status, 403);
  errorCode = 'PGRST205';
  const otp = loadServerModule<typeof import('../lib/plugin-otp')>('lib/plugin-otp.ts', {
    'next/server': {},
    '@/lib/mail/email-service': {},
    '@/lib/order-access-token': {pluginProof: () => 'fixture'},
    '@/lib/plugin-download': plugins,
    '@/lib/stripe-server': {readStripeBody: async () => Buffer.from('{"email":"buyer@example.invalid","code":"123456"}')},
    '@/lib/unified-commerce': core,
  });
  assert.equal((await otp.requestPluginOtp(request)).status, 403);
  assert.equal((await otp.verifyPluginOtp(request)).status, 403);
});
