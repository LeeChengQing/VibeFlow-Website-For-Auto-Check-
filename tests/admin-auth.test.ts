import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadServerModule } from './helpers/server-module';

type Auth = typeof import('../lib/admin-auth');
const password = 'correct-admin-password';
const secret = 'ab'.repeat(32);

function setup(production = false) {
  const env: Record<string, string | undefined> = {
    NODE_ENV: production ? 'production' : 'development',
    ADMIN_DASHBOARD_PASSWORD: password,
    ADMIN_SESSION_SECRET: secret,
  };
  const values = new Map<string, string>();
  const writes: { name: string; value: string; options: Record<string, unknown> }[] = [];
  let now = 1_800_000_000_000;
  class Clock extends Date { static now() { return now; } }
  const auth = loadServerModule<Auth>('lib/admin-auth.ts', {
    'next/headers': { cookies: async () => ({
      get: (name: string) => values.has(name) ? { value: values.get(name) } : undefined,
      set: (name: string, value: string, options: Record<string, unknown>) => {
        values.set(name, value);
        writes.push({ name, value, options });
      },
    }) },
  }, { process: { env }, Date: Clock });
  return { auth, env, values, writes, advance: (milliseconds: number) => { now += milliseconds; } };
}

test('wrong and malformed passwords wait two seconds; exact passwords pass', async () => {
  const { auth } = setup();
  assert.equal(await auth.verifyAdminPassword(password), true);
  const start = performance.now();
  const results = await Promise.all([
    auth.verifyAdminPassword('incorrect-password'),
    auth.verifyAdminPassword({ password }),
    auth.verifyAdminPassword('x'.repeat(1_025)),
  ]);
  assert.deepEqual(results, [false, false, false]);
  assert.ok(performance.now() - start >= 1_950, 'failures must incur the fixed delay');
});

test('production sessions are host-only, HTTPS-only and expire after eight hours', async () => {
  const { auth, writes, advance } = setup(true);
  await auth.createAdminSession();
  const cookie = writes[0];
  assert.equal(cookie.name, '__Host-auto_check_admin');
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, 'strict');
  assert.equal(cookie.options.path, '/');
  assert.equal(cookie.options.domain, undefined);
  assert.equal(cookie.options.maxAge, 28_800);
  assert.equal(Number(cookie.options.expires), 1_800_028_800_000);
  assert.ok(await auth.requireAdminSession());
  advance(28_800_000);
  assert.equal(await auth.getAdminSession(), null);
  await assert.rejects(auth.requireAdminSession(), /UNAUTHORIZED/);
});

test('missing, malformed and tampered cookies are denied', async () => {
  const { auth, values, writes } = setup();
  assert.equal(await auth.getAdminSession(), null);
  await auth.createAdminSession();
  const { name, value } = writes[0];
  assert.equal(name, 'auto_check_admin');
  assert.equal(writes[0].options.secure, false);
  for (const invalid of ['', 'unsigned', `${value}.extra`, 'x'.repeat(4_096),
    `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}`]) {
    values.set(name, invalid);
    assert.equal(await auth.getAdminSession(), null);
    await assert.rejects(auth.requireAdminSession(), /UNAUTHORIZED/);
  }
});

test('even correctly signed future or excessive-lifetime claims are denied', async () => {
  const { auth, values } = setup();
  const now = 1_800_000_000;
  for (const [issuedAt, expiresAt] of [[now + 60, now + 28_860], [now, now + 28_801]]) {
    const payload = `v1.${issuedAt}.${expiresAt}.${'cd'.repeat(16)}`;
    const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
      .update('auto-check-admin-session-v1\0')
      .update(createHash('sha256').update(password).digest())
      .update(payload).digest('hex');
    values.set('auto_check_admin', `${payload}.${signature}`);
    assert.equal(await auth.getAdminSession(), null);
  }
});

test('password and signing-secret rotation invalidate existing cookies', async () => {
  for (const variable of ['ADMIN_DASHBOARD_PASSWORD', 'ADMIN_SESSION_SECRET']) {
    const { auth, env } = setup();
    await auth.createAdminSession();
    env[variable] = variable === 'ADMIN_SESSION_SECRET' ? 'ef'.repeat(32) : 'changed-admin-password';
    assert.equal(await auth.getAdminSession(), null);
  }
});

test('missing or malformed auth configuration fails closed', async () => {
  for (const [variable, value] of [
    ['ADMIN_DASHBOARD_PASSWORD', undefined], ['ADMIN_DASHBOARD_PASSWORD', 'short'],
    ['ADMIN_DASHBOARD_PASSWORD', 'x'.repeat(1_025)], ['ADMIN_SESSION_SECRET', undefined],
    ['ADMIN_SESSION_SECRET', 'not-a-hex-key'],
  ] as const) {
    const { auth, env, writes } = setup();
    env[variable] = value;
    await assert.rejects(auth.createAdminSession(), /ADMIN_NOT_CONFIGURED/);
    await assert.rejects(auth.verifyAdminPassword(password), /ADMIN_NOT_CONFIGURED/);
    await assert.rejects(auth.getAdminSession(), /ADMIN_NOT_CONFIGURED/);
    assert.equal(writes.length, 0);
  }
});

test('logout expires the cookie with matching security attributes', async () => {
  const { auth, writes } = setup(true);
  await auth.createAdminSession();
  await auth.deleteAdminSession();
  const cookie = writes[1];
  assert.equal(cookie.name, writes[0].name);
  assert.equal(cookie.value, '');
  assert.equal(cookie.options.maxAge, 0);
  assert.equal(Number(cookie.options.expires), 0);
  assert.equal(cookie.options.secure, true);
  assert.equal(await auth.getAdminSession(), null);
});
