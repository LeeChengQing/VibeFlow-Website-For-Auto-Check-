import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServerModule } from './helpers/server-module';
import * as config from '../lib/site-config';

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
