import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServerModule } from './helpers/server-module';
import * as config from '../lib/site-config';
import { createClient } from '@supabase/supabase-js';

test('every configuration mutation authenticates before persistence and rejects malformed input', async () => {
  let authorized = false, writes = 0;
  const actions = loadServerModule<typeof import('../app/admin/site-actions')>('app/admin/site-actions.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/admin-auth': { async requireAdminSession() { if (!authorized) throw new Error('UNAUTHORIZED'); } },
    '@/lib/site-config': config,
    '@/lib/site-settings': { async mutateSiteSettings() { writes++; return 1; }, async getSiteManagementData() { return { draft: config.DEFAULT_SITE_CONFIG }; } },
    '@/lib/site-assets': { async validateConfigAssets() {}, async storeSiteAsset() { writes++; return { id: 'id' }; } },
  }, { File });
  for (const result of [await actions.saveSiteDraftAction(config.DEFAULT_SITE_CONFIG, 0), await actions.publishSiteAction(0, 'test'), await actions.restoreSiteAction('bad', 0), await actions.uploadSiteAssetAction(new FormData()), await actions.prepareSiteUploadAction('guide', 'image/png', 100, 'guide.png'), await actions.completeSiteUploadAction('bad'), await actions.revokeKeyAction('bad')]) assert.ok('error' in result);
  assert.equal(writes, 0);
  authorized = true;
  assert.ok('error' in await actions.saveSiteDraftAction({ packages: [] }, 0));
  assert.ok('error' in await actions.publishSiteAction(-1, 'test'));
  assert.ok('error' in await actions.restoreSiteAction('../../bad', 0));
  assert.equal(writes, 0);
  const saved = await actions.saveSiteDraftAction(config.DEFAULT_SITE_CONFIG, 0);
  assert.ok('ok' in saved && saved.ok && saved.version === 1);
  assert.equal(writes, 1);
});

function licenseActions(options: { authorized?: boolean; found?: boolean; failAudit?: boolean; dbError?: boolean } = {}) {
  const requests: { url: URL; method: string; body: unknown }[] = [];
  const activity: string[] = [];
  const refreshed: string[] = [];
  const db = createClient('https://example.supabase.co', 'test-service-key', {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, method: init?.method ?? 'GET', body: JSON.parse(String(init?.body ?? 'null')) });
      if (url.pathname !== '/rest/v1/issued_licenses' || options.dbError) {
        return new Response(JSON.stringify({ message: 'private-database-error' }), { status: 400 });
      }
      return new Response(JSON.stringify(options.found === false ? [] : [{ id: '00000000-0000-4000-8000-000000000001' }]), {
        headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  const actions = loadServerModule<typeof import('../app/admin/site-actions')>('app/admin/site-actions.ts', {
    'next/cache': { revalidatePath(path: string) { refreshed.push(path); } },
    '@/lib/admin-auth': { async requireAdminSession() { if (options.authorized === false) throw new Error('UNAUTHORIZED'); } },
    '@/lib/site-config': config,
    '@/lib/site-settings': {
      async getSiteAdminDatabase() { return db; },
      async recordSiteActivity(action: string, detail: string) {
        if (options.failAudit) throw new Error('private-audit-error');
        activity.push(`${action}:${detail}`);
      },
    },
    '@/lib/site-assets': {},
  });
  return { actions, requests, activity, refreshed };
}

test('license revocation authenticates and targets only an active issued license, then audits and refreshes', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const { actions, requests, activity, refreshed } = licenseActions();
  assert.ok('ok' in await actions.revokeKeyAction(id));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'PATCH');
  assert.equal(requests[0].url.pathname, '/rest/v1/issued_licenses');
  assert.equal(requests[0].url.searchParams.get('id'), `eq.${id}`);
  assert.equal(requests[0].url.searchParams.get('status'), 'eq.active');
  assert.equal(requests[0].url.searchParams.get('select'), 'id');
  assert.deepEqual(requests[0].body, { status: 'revoked' });
  assert.deepEqual(activity, [`revoke_license:Revoked issued license ${id}`]);
  assert.deepEqual(refreshed, ['/admin']);
  for (const options of [{ authorized: false }, {}]) {
    const denied = licenseActions(options);
    assert.ok('error' in await denied.actions.revokeKeyAction(options.authorized === false ? id : '-'.repeat(36)));
    assert.equal(denied.requests.length, 0);
  }
});

test('missing or already revoked licenses fail safely; audit failures after revocation report success with a warning', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  for (const options of [{ found: false }, { dbError: true }]) {
    const denied = licenseActions(options);
    const result = await denied.actions.revokeKeyAction(id);
    assert.ok('error' in result);
    assert.ok(!JSON.stringify(result).includes('private-'));
    assert.deepEqual(denied.activity, []);
    assert.deepEqual(denied.refreshed, []);
  }
  const failedAudit = licenseActions({ failAudit: true });
  const result = await failedAudit.actions.revokeKeyAction(id);
  assert.ok('ok' in result);
  assert.ok('warning' in result && typeof result.warning === 'string');
  assert.ok(!JSON.stringify(result).includes('private-'));
  assert.equal(failedAudit.requests.length, 1);
  assert.deepEqual(failedAudit.refreshed, ['/admin']);
});
