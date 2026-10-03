import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { requireAdminSession } from './admin-auth';
import { isLocalSiteManagement, getSiteAdminDatabase, readSiteAssetRecord, downloadSiteObject, recordSiteActivity } from './site-settings';
import type { SiteConfig } from './site-config';
import type { SiteAsset } from './site-local-store';

export async function validateAssetFile(file: File, kind: 'guide' | 'release') {
  if (!(file instanceof File) || file.size < 1 || file.size > (kind === 'guide' ? 5 : 20) * 1024 * 1024) throw new Error('INVALID_UPLOAD');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const buffer = Buffer.from(bytes);
  let mime = '', extension = '';
  if (kind === 'release') {
    if (buffer.length < 22 || !['504b0304', '504b0506'].includes(buffer.subarray(0, 4).toString('hex'))) throw new Error('INVALID_UPLOAD');
    mime = 'application/zip'; extension = 'zip';
  } else {
    if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') { mime = 'image/png'; extension = 'png'; }
    else if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') { mime = 'image/jpeg'; extension = 'jpg'; }
    else if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') { mime = 'image/webp'; extension = 'webp'; }
    else throw new Error('INVALID_UPLOAD');
    try {
      const metadata = await sharp(buffer, { limitInputPixels: 25_000_000 }).metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > 25_000_000 || (metadata.pages ?? 1) > 1) throw new Error();
    } catch { throw new Error('INVALID_UPLOAD'); }
  }
  const name = file.name.replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0, 120) || `upload.${extension}`;
  return { bytes, mime, extension, name };
}

function localObjectPath(objectPath: string) {
  if (!/^(guide|release)\/[0-9a-f-]{36}\.(png|jpg|webp|zip)$/.test(objectPath)) throw new Error('INVALID_UPLOAD');
  // Runtime development uploads are never deployment build inputs.
  const root = resolve(/* turbopackIgnore: true */ process.env.SITE_MANAGEMENT_ASSET_DIR || join(process.cwd(), '.local', 'site-assets'));
  const target = resolve(root, objectPath);
  if (!target.startsWith(root + sep)) throw new Error('INVALID_UPLOAD');
  return target;
}
export async function storeSiteAsset(file: File, kind: 'guide' | 'release'): Promise<SiteAsset> {
  await requireAdminSession();
  const valid = await validateAssetFile(file, kind), id = randomUUID();
  const objectPath = `${kind}/${id}.${valid.extension}`;
  const asset: SiteAsset = { id, kind, mime: valid.mime, size: valid.bytes.byteLength, name: valid.name, objectPath, createdAt: new Date().toISOString() };
  if (await isLocalSiteManagement()) {
    const path = localObjectPath(objectPath);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, valid.bytes, { flag: 'wx' });
    try { (await import('./site-local-store')).saveLocalAsset(asset); }
    catch (error) { await unlink(path); throw error; }
  } else {
    const db = await getSiteAdminDatabase();
    const { error: uploadError } = await db.storage.from('site-assets').upload(objectPath, valid.bytes, { contentType: valid.mime, upsert: false });
    if (uploadError) throw new Error('UPLOAD_UNAVAILABLE');
    const { error } = await db.from('site_assets').insert({ id, kind, mime: valid.mime, size: asset.size, name: asset.name, object_path: objectPath });
    if (error) { await db.storage.from('site-assets').remove([objectPath]); throw new Error('UPLOAD_UNAVAILABLE'); }
  }
  await recordSiteActivity('upload', `${kind === 'guide' ? 'Guide image' : 'Extension release'}: ${valid.name}`);
  return asset;
}
export async function validateConfigAssets(config: SiteConfig) {
  for (const guide of config.guides) {
    if (!guide.src.startsWith('/api/site/assets/')) continue;
    const asset = await readSiteAssetRecord(guide.src.slice('/api/site/assets/'.length));
    if (!asset || asset.kind !== 'guide') throw new Error('INVALID_UPLOAD');
  }
  if (config.settings.extensionRelease) {
    const asset = await readSiteAssetRecord(config.settings.extensionRelease.assetId);
    if (!asset || asset.kind !== 'release') throw new Error('INVALID_UPLOAD');
  }
}
export async function readAssetBytes(asset: SiteAsset): Promise<Uint8Array> {
  if (await isLocalSiteManagement()) return new Uint8Array(await readFile(/* turbopackIgnore: true */ localObjectPath(asset.objectPath)));
  return new Uint8Array(await (await downloadSiteObject(asset.objectPath)).arrayBuffer());
}

export async function prepareSignedSiteUpload(kind: 'guide' | 'release', mimeInput: string, size: number, name: string) {
  await requireAdminSession();
  if (typeof name !== 'string' || typeof mimeInput !== 'string') throw new Error('INVALID_UPLOAD');
  const suffix = name.toLowerCase().split('.').pop() || '';
  const inferred = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[suffix] || '';
  const mime = kind === 'release' ? 'application/zip' : mimeInput || inferred;
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/zip': 'zip' } as Record<string, string>)[mime];
  if (!extension || (kind === 'guide' && !mime.startsWith('image/')) || !Number.isSafeInteger(size) || size < 1 || size > (kind === 'guide' ? 5 : 20) * 1024 * 1024 || typeof name !== 'string' || !name || name.length > 240) throw new Error('INVALID_UPLOAD');
  const id = randomUUID(), objectPath = `${kind}/${id}.${extension}`, db = await getSiteAdminDatabase();
  const safeName = name.replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0, 120);
  const { error } = await db.from('site_uploads').insert({ id, kind, mime, size, name: safeName, object_path: objectPath });
  if (error) throw new Error('UPLOAD_UNAVAILABLE');
  const signed = await db.storage.from('site-assets').createSignedUploadUrl(objectPath, { upsert: false });
  if (signed.error || !signed.data) { await db.from('site_uploads').delete().eq('id', id); throw new Error('UPLOAD_UNAVAILABLE'); }
  return { id, url: signed.data.signedUrl, mime };
}
export async function completeSignedSiteUpload(id: string): Promise<SiteAsset> {
  await requireAdminSession();
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('INVALID_UPLOAD');
  const db = await getSiteAdminDatabase();
  const completed = await readSiteAssetRecord(id);
  if (completed) return completed;
  const { data: pending, error } = await db.from('site_uploads').select('*').eq('id', id).single();
  if (error || !pending || Date.parse(pending.expires_at) <= Date.now()) throw new Error('INVALID_UPLOAD');
  const downloaded = await db.storage.from('site-assets').download(pending.object_path);
  if (downloaded.error || !downloaded.data || downloaded.data.size !== Number(pending.size)) throw new Error('INVALID_UPLOAD');
  const file = new File([downloaded.data], pending.name, { type: pending.mime });
  try {
    const valid = await validateAssetFile(file, pending.kind);
    if (valid.mime !== pending.mime) throw new Error('INVALID_UPLOAD');
    const stored = await db.from('site_assets').insert({ id, kind: pending.kind, mime: valid.mime, size: valid.bytes.byteLength, name: valid.name, object_path: pending.object_path });
    if (stored.error) throw new Error('UPLOAD_UNAVAILABLE');
    await db.from('site_uploads').delete().eq('id', id);
    await recordSiteActivity('upload', `${pending.kind === 'guide' ? 'Guide image' : 'Extension release'}: ${valid.name}`);
    return { id, kind: pending.kind, mime: valid.mime, size: valid.bytes.byteLength, name: valid.name, objectPath: pending.object_path, createdAt: new Date().toISOString() };
  } catch (failure) {
    if (failure instanceof Error && failure.message === 'INVALID_UPLOAD') {
      await db.storage.from('site-assets').remove([pending.object_path]);
      await db.from('site_uploads').delete().eq('id', id);
    }
    throw failure;
  }
}
