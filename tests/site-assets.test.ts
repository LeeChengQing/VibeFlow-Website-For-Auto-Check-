import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServerModule } from './helpers/server-module';

test('uploads validate actual bytes, size and media kind instead of trusting filenames', async () => {
  const assets = loadServerModule<typeof import('../lib/site-assets')>('lib/site-assets.ts', {
    './admin-auth': {}, './site-settings': {}, './site-config': {},
  }, { File });
  await assert.rejects(assets.validateAssetFile(new File(['<svg onload="alert(1)"/>'], 'fake.png', { type: 'image/png' }), 'guide'), /INVALID_UPLOAD/);
  await assert.rejects(assets.validateAssetFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }), 'guide'), /INVALID_UPLOAD/);
  await assert.rejects(assets.validateAssetFile(new File([Buffer.from('504b0304', 'hex')], 'zip.jpg', { type: 'image/jpeg' }), 'guide'), /INVALID_UPLOAD/);
  const png = new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGLsAAAAASUVORK5CYII=', 'base64')], 'tiny.png', { type: 'image/png' });
  const valid = await assets.validateAssetFile(png, 'guide');
  assert.equal(valid.mime, 'image/png');
  const zip = new File([Buffer.from('504b0506000000000000000000000000000000000000', 'hex')], '../../private.zip', { type: 'application/zip' });
  const release = await assets.validateAssetFile(zip, 'release');
  assert.equal(release.mime, 'application/zip');
  assert.ok(!release.name.includes('/'));
});

test('private signed uploads authenticate, normalize Windows ZIP MIME, and verify bytes before registration', async () => {
  let authorized = false, inserted = 0, signed = 0, removed = 0;
  let bytes = new Blob([Buffer.from('504b0506000000000000000000000000000000000000', 'hex')]);
  let pending = { kind: 'release', mime: 'application/zip', name: 'extension.zip', size: bytes.size, object_path: 'release/test.zip', expires_at: new Date(Date.now() + 60_000).toISOString() };
  const db = {
    from(table: string) { return {
      async insert() { if (table === 'site_assets') inserted++; return { error: null }; },
      delete() { return { async eq() { return { error: null }; } }; },
      select() { return { eq() { return { async single() { return { data: pending, error: null }; } }; } }; },
    }; },
    storage: { from() { return {
      async createSignedUploadUrl() { signed++; return { data: { signedUrl: 'https://storage.example/upload' }, error: null }; },
      async download() { return { data: bytes, error: null }; },
      async remove() { removed++; return { error: null }; },
    }; } },
  };
  const assets = loadServerModule<typeof import('../lib/site-assets')>('lib/site-assets.ts', {
    './admin-auth': { async requireAdminSession() { if (!authorized) throw new Error('UNAUTHORIZED'); } },
    './site-settings': { async getSiteAdminDatabase() { return db; }, async readSiteAssetRecord() { return null; }, async recordSiteActivity() {} },
  }, { File });
  await assert.rejects(assets.prepareSignedSiteUpload('release', 'application/zip', 22, 'extension.zip'), /UNAUTHORIZED/);
  await assert.rejects(assets.completeSignedSiteUpload('00000000-0000-4000-8000-000000000000'), /UNAUTHORIZED/);
  assert.equal(signed, 0); assert.equal(inserted, 0);
  authorized = true;
  const upload = await assets.prepareSignedSiteUpload('release', 'application/x-zip-compressed', 22, 'extension.zip');
  assert.equal(upload.mime, 'application/zip');
  assert.equal((await assets.prepareSignedSiteUpload('guide', '', 100, 'guide.jpeg')).mime, 'image/jpeg');
  await assert.rejects(assets.prepareSignedSiteUpload('guide', 'image/svg+xml', 100, 'guide.svg'), /INVALID_UPLOAD/);
  await assert.rejects(assets.prepareSignedSiteUpload('release', 'application/zip', 20 * 1024 * 1024 + 1, 'big.zip'), /INVALID_UPLOAD/);
  const completed = await assets.completeSignedSiteUpload(upload.id);
  assert.equal(completed.mime, 'application/zip'); assert.equal(inserted, 1);
  pending = { ...pending, expires_at: new Date(Date.now() - 60_000).toISOString() };
  await assert.rejects(assets.completeSignedSiteUpload(upload.id), /INVALID_UPLOAD/);
  assert.equal(inserted, 1);
  bytes = new Blob(['<svg onload="alert(1)"/>']);
  pending = { ...pending, kind: 'guide', mime: 'image/png', name: 'fake.png', size: bytes.size, expires_at: new Date(Date.now() + 60_000).toISOString() };
  await assert.rejects(assets.completeSignedSiteUpload(upload.id), /INVALID_UPLOAD/);
  assert.equal(inserted, 1); assert.equal(removed, 1);
});
