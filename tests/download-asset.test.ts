import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadServerModule } from './helpers/server-module';

const validToken = '1111111111111111111111111111111111111111111111111111111111111111';
const validTokenHash = createHash('sha256').update(validToken).digest('hex');

const fakeZipBytes = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');

function setupDownloadRoute(orderRow: Record<string, unknown> | null, assetRecord: any = null) {
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: orderRow, error: null }),
        }),
      }),
    }),
  };

  const route = loadServerModule<any>('app/api/site/download/[token]/route.ts', {
    'server-only': {},
    '@/lib/supabase/commerce': {
      getCommerceDatabase: () => db,
      isCommerceConfigured: () => true,
    },
    '@/lib/site-settings': {
      readSiteAssetRecord: async () => assetRecord,
      getPublishedSiteConfig: async () => ({
        settings: { extensionRelease: { assetId: 'mock-asset-id', label: 'v1.0.0' } },
      }),
    },
    '@/lib/site-assets': {
      readAssetBytes: async () => fakeZipBytes,
    },
    '@/lib/security': {
      localOnly: () => {},
    },
  }, {
    Request, Response, AbortSignal, Headers, Blob,
    process: { env: { NODE_ENV: 'production' } },
  });

  return route;
}

test('download route rejects malformed or unauthenticated token', async () => {
  const route = setupDownloadRoute(null);
  const req = new Request('https://auto-check.example/api/site/download/short-token');
  const res = await route.GET(req, { params: Promise.resolve({ token: 'short-token' }) });
  assert.equal(res.status, 404);
});

test('download route rejects unpaid, refunded, or non-extension orders', async () => {
  // Pending order
  let route = setupDownloadRoute({
    id: '00000000-0000-4000-8000-000000000001',
    plan: 'extension',
    status: 'pending',
    order_access_token_hash: validTokenHash,
  });
  let res = await route.GET(new Request(`https://auto-check.example/api/site/download/${validToken}`), {
    params: Promise.resolve({ token: validToken }),
  });
  assert.equal(res.status, 404);

  // Refunded order
  route = setupDownloadRoute({
    id: '00000000-0000-4000-8000-000000000001',
    plan: 'extension',
    status: 'refunded',
    order_access_token_hash: validTokenHash,
  });
  res = await route.GET(new Request(`https://auto-check.example/api/site/download/${validToken}`), {
    params: Promise.resolve({ token: validToken }),
  });
  assert.equal(res.status, 404);

  // Notification-only plan (semester)
  route = setupDownloadRoute({
    id: '00000000-0000-4000-8000-000000000001',
    plan: 'semester',
    status: 'paid',
    order_access_token_hash: validTokenHash,
  });
  res = await route.GET(new Request(`https://auto-check.example/api/site/download/${validToken}`), {
    params: Promise.resolve({ token: validToken }),
  });
  assert.equal(res.status, 404);
});

test('download route streams release ZIP with secure headers for paid extension order', async () => {
  const mockAsset = {
    id: 'mock-asset-id',
    kind: 'release',
    name: 'auto-check-v1.0.0.zip',
    mime: 'application/zip',
    objectPath: 'release/mock.zip',
  };

  const route = setupDownloadRoute({
    id: '00000000-0000-4000-8000-000000000001',
    plan: 'extension',
    status: 'paid',
    order_access_token_hash: validTokenHash,
    release_asset_id: 'mock-asset-id',
  }, mockAsset);

  const res = await route.GET(new Request(`https://auto-check.example/api/site/download/${validToken}`), {
    params: Promise.resolve({ token: validToken }),
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/zip');
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.ok(res.headers.get('Content-Disposition')?.includes('auto-check-v1.0.0.zip'));

  const arrayBuffer = await res.arrayBuffer();
  assert.equal(Buffer.from(arrayBuffer).length, fakeZipBytes.length);
});
