import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { loadServerModule } from './helpers/server-module';
import { LocaleProvider, useLocale } from '../components/LocaleProvider';
import { getOrderPlanDisplay, isNotificationPlan } from '../lib/plans';
import { generateOrderAccessToken, hashOrderAccessToken } from '../lib/order-access-token';

const { encryptLicenseKey } = loadServerModule<any>('lib/license-key-encryption.ts', { 'server-only': {} });

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

test('Appendix B.8: vercel.json contains keepalive cron for /api/health', () => {
  assert.ok(existsSync('vercel.json'), 'vercel.json must exist for Vercel Cron fallback keepalive');
  const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.ok(Array.isArray(vercelConfig.crons), 'vercel.json must contain crons array');
  const healthCron = vercelConfig.crons.find((c: any) => c.path === '/api/health');
  assert.ok(healthCron, 'Must have a cron job hitting /api/health');
  assert.equal(healthCron.schedule, '0 2 * * *');
});

test('Appendix B.8: GitHub Actions keepalive and backup workflows are configured', () => {
  assert.ok(existsSync('.github/workflows/keepalive.yml'), 'keepalive.yml workflow must exist');
  const keepaliveYaml = readFileSync('.github/workflows/keepalive.yml', 'utf8');
  assert.match(keepaliveYaml, /schedule:/);
  assert.match(keepaliveYaml, /cron:\s*'0 4 \*\/2 \* \*'/);
  assert.match(keepaliveYaml, /\/api\/health/);

  assert.ok(existsSync('.github/workflows/backup.yml'), 'backup.yml workflow must exist');
  const backupYaml = readFileSync('.github/workflows/backup.yml', 'utf8');
  assert.match(backupYaml, /schedule:/);
  assert.match(backupYaml, /cron:\s*'0 2 \* \* 0'/);
  assert.match(backupYaml, /supabase_backup_/);
});

test('Appendix B.8: /api/orders/[token] direct token access returns license, masked email, and security headers', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = '00000000-0000-4000-8000-000000000099';
  const invId = '00000000-0000-4000-8000-000000000098';
  const licId = '00000000-0000-4000-8000-000000000097';

  process.env.LICENSE_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

  const rawKey = 'TEST-KEY-APX-B-001';
  const keyHash = 'd'.repeat(64);
  const encKey = encryptLicenseKey(rawKey, keyHash);

  const { token, tokenHash } = generateOrderAccessToken();

  await db.query(`
    insert into public.key_inventory (id, key_hash, plan_type, status, encrypted_key)
    values ($1, $2, 'core', 'assigned', $3)
  `, [invId, keyHash, encKey]);

  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_payment_id, status, payment_confirmed_at, order_access_token_hash
    ) values (
      $1, 'VF-ZERO-COST-01', 'southampton_student@soton.ac.uk', 'semester', 'MYR', 3500,
      'stripe', 'pi_test_appb_01', 'paid', now(), $2
    )
  `, [orderId, tokenHash]);

  await db.query(`
    insert into public.issued_licenses (id, order_id, inventory_id, buyer_email, plan_type, status)
    values ($1, $2, $3, 'southampton_student@soton.ac.uk', 'core', 'active')
  `, [licId, orderId, invId]);

  // Load route handler with commerce mock pointing to PGlite
  const routeModule = loadServerModule<any>('app/api/orders/[token]/route.ts', {
    'server-only': {},
    '@/lib/store': {},
    '@/lib/license-key-encryption': {
      decryptLicenseKey: (enc: string, hash: string) => rawKey,
    },
    '@/lib/security': {
      localOnly: () => {},
      apiError: (err: any) => new Response(JSON.stringify({ error: err.message }), { status: 404 }),
      rateLimit: () => {},
    },
    '@/lib/supabase/commerce': {
      isCommerceConfigured: () => true,
      getCommerceDatabase: () => ({
        from: (table: string) => {
          const filters: Record<string, any> = {};
          const builder = {
            select: () => builder,
            eq: (col: string, val: any) => {
              filters[col] = val;
              return builder;
            },
            maybeSingle: async () => {
              const whereParts = Object.keys(filters).map((col, idx) => `${col} = $${idx + 1}`);
              const values = Object.values(filters);
              const sql = `select * from public.${table} ${whereParts.length ? `where ${whereParts.join(' and ')}` : ''} limit 1`;
              const rows = (await db.query<any>(sql, values)).rows;
              return { data: rows[0] || null, error: null };
            },
          };
          return builder;
        },
      }),
    },
  }, {
    Request, Response,
  });

  // 1. Success query with valid token
  const req = new Request(`http://localhost/api/orders/${token}`);
  const res = await routeModule.GET(req, { params: Promise.resolve({ token }) });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate');
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');

  const data = await res.json();
  assert.equal(data.reference, 'VF-ZERO-COST-01');
  assert.equal(data.delivery, rawKey);
  assert.equal(data.email, 's•••••@soton.ac.uk');
  assert.equal(data.status, 'paid');

  // 2. Query with invalid token returns 404
  const resBad = await routeModule.GET(req, { params: Promise.resolve({ token: 'invalid_token_12345' }) });
  assert.equal(resBad.status, 404);
});

test('Appendix B.8: Admin generate_recovery_link rotates token and returns secure URL', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const orderId = '00000000-0000-4000-8000-000000000088';
  await db.query(`
    insert into public.orders (
      id, reference, buyer_email, plan, currency, amount_minor,
      payment_provider, provider_payment_id, status, payment_confirmed_at, order_access_token_hash
    ) values (
      $1, 'VF-RECOVERY-01', 'student_needs_help@soton.ac.uk', 'semester', 'MYR', 3500,
      'stripe', 'pi_test_appb_02', 'paid', now(), 'initial_hash_val'
    )
  `, [orderId]);

  const opsModule = loadServerModule<any>('lib/site-operations.ts', {
    'server-only': {},
    '@/lib/admin-auth': { requireAdminSession: async () => ({ issuedAt: 1, expiresAt: 9999999999 }) },
    '@/lib/admin-local': { isLocalAdminPreview: async () => false },
    '@/lib/supabase/commerce': { getCommerceDatabase: () => db, isCommerceConfigured: () => true },
  }, {
    Request, Response, AbortSignal,
    process: { env: { NODE_ENV: 'production', APP_URL: 'https://auto-check-app.example.com' } },
  });

  const recoveryUrl = await opsModule.runSiteOperation('generate_recovery_link', orderId);
  assert.match(recoveryUrl, /^https:\/\/auto-check-app\.example\.com\/order\/[a-zA-Z0-9_-]+$/);

  const newHashInDb = (await db.query<any>(`select order_access_token_hash from public.orders where id = $1`, [orderId])).rows[0].order_access_token_hash;
  assert.notEqual(newHashInDb, 'initial_hash_val');

  const extractedToken = recoveryUrl.split('/order/')[1];
  assert.equal(hashOrderAccessToken(extractedToken), newHashInDb);
});

test('Appendix B.8: PaymentReturn UI displays zero-cost delivery notice and order access credential card', () => {
  const dependencies: Record<string, unknown> = {
    react: React,
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    './LocaleProvider': { useLocale },
    './PaymentFailure': { PaymentFailure: () => React.createElement('div', null, 'Payment Failure') },
    '@/lib/plans': { getOrderPlanDisplay, isNotificationPlan },
    'next/dynamic': () => () => null,
  };
  const globals = { window: { setInterval: () => 1, clearInterval: () => {} } };
  const PaymentReturnComponent = loadServerModule<any>('components/PaymentReturn.tsx', dependencies, globals).PaymentReturn;

  const testToken = 'tok_live_recovery_credential_12345';
  const htmlZh = renderToStaticMarkup(React.createElement(LocaleProvider, {
    defaultLocale: 'zh', persist: false,
    children: React.createElement(PaymentReturnComponent, {
      status: 'success',
      orderAccessToken: testToken,
      receipt: {
        reference: 'VF-RECEIPT-999',
        plan: 'semester',
        amount: 3500,
        maskedEmail: 's•••••@soton.ac.uk',
        paidAt: new Date().toISOString(),
        paymentProvider: 'stripe',
      },
    }),
  }));

  assert.match(htmlZh, /零成本模式提示：请务必保存订单凭证/);
  assert.match(htmlZh, /下载凭证文件 \(\.txt\)/);
  assert.match(htmlZh, /复制凭证代码/);
  assert.match(htmlZh, new RegExp(testToken));

  const htmlEn = renderToStaticMarkup(React.createElement(LocaleProvider, {
    defaultLocale: 'en', persist: false,
    children: React.createElement(PaymentReturnComponent, {
      status: 'success',
      orderAccessToken: testToken,
      receipt: {
        reference: 'VF-RECEIPT-999',
        plan: 'semester',
        amount: 3500,
        maskedEmail: 's•••••@soton.ac.uk',
        paidAt: new Date().toISOString(),
        paymentProvider: 'stripe',
      },
    }),
  }));

  assert.match(htmlEn, /Zero-Cost Delivery Notice: Please save your credential/);
  assert.match(htmlEn, /Download Credential \(\.txt\)/);
  assert.match(htmlEn, /Copy Credential Token/);
});

test('Appendix B.8: Zero hardcoded vercel.app in application code (app/, lib/, components/, supabase/functions/)', () => {
  const targetDirs = ['app', 'lib', 'components', 'supabase/functions'];
  const scannedFiles: string[] = [];

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
        scannedFiles.push(fullPath);
      }
    }
  }

  for (const d of targetDirs) {
    walk(d);
  }

  assert.ok(scannedFiles.length > 20, 'Should scan real application source files');

  const violations: string[] = [];
  for (const file of scannedFiles) {
    const content = readFileSync(file, 'utf8');
    if (content.includes('vercel.app')) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, [], `No application source file should hardcode vercel.app: ${violations.join(', ')}`);
});
