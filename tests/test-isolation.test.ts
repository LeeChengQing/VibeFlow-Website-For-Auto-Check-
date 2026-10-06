import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { isolatedTestEnvironment } from '../scripts/lib/test-environment.mjs';
import { installNetworkGuard, restoreNetworkGuard } from '../scripts/test-network-guard.mjs';

test('isolatedTestEnvironment strips production credentials and live endpoints', () => {
  const dirtyEnv = {
    STRIPE_SECRET_KEY: 'sk_live_1234567890abcdef',
    STRIPE_WEBHOOK_SECRET: 'whsec_live_abcdef123456',
    SUPABASE_URL: 'https://prod-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.live_secret',
    TOYYIBPAY_SECRET_KEY: 'live_toyyib_secret',
    ADMIN_DASHBOARD_PASSWORD: 'super_secret_admin_pass',
    LICENSE_KEY_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    APP_URL: 'https://vibeflow.pro',
    PATH: process.env.PATH,
  };

  const safe = isolatedTestEnvironment(dirtyEnv);

  assert.equal(safe.NODE_ENV, 'test');
  assert.equal(safe.APP_URL, 'http://127.0.0.1:3000');
  assert.notEqual(safe.STRIPE_SECRET_KEY, 'sk_live_1234567890abcdef');
  assert.match(safe.STRIPE_SECRET_KEY, /^sk_test_/);
  assert.notEqual(safe.SUPABASE_URL, 'https://prod-project.supabase.co');
  assert.match(safe.SUPABASE_URL, /^http:\/\/(127\.0\.0\.1|localhost)/);
  assert.equal(safe.TOYYIBPAY_SECRET_KEY, 'test_toyyib_secret');
});

test('network guard blocks non-loopback external HTTP requests while allowing loopback', async () => {
  const guard = installNetworkGuard();
  try {
    // 1. External request must be rejected
    await assert.rejects(
      async () => {
        await fetch('https://api.stripe.com/v1/charges');
      },
      /Blocked external network call in test environment/
    );

    // 2. Loopback local server must be allowed
    const localServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });

    await new Promise<void>((resolve) => localServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (localServer.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test`);
      const text = await res.text();
      assert.equal(text, 'ok');
    } finally {
      await new Promise((resolve) => localServer.close(resolve));
    }
  } finally {
    restoreNetworkGuard(guard);
  }
});
