'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/admin-auth';
import { validateSiteConfig, type SiteActionResult } from '@/lib/site-config';
import { mutateSiteSettings, getSiteManagementData, getSiteAdminDatabase, recordSiteActivity } from '@/lib/site-settings';
import { storeSiteAsset, validateConfigAssets, prepareSignedSiteUpload, completeSignedSiteUpload } from '@/lib/site-assets';

function safeError(error: unknown): SiteActionResult {
  const message = error instanceof Error ? error.message : '';
  return { error: message === 'UNAUTHORIZED' ? 'Your session has expired. Sign in again.' : message === 'VERSION_CONFLICT' ? 'Another change was saved. Reload before editing again.' : message === 'INVALID_SITE_CONFIG' ? 'Check prices, package fields, dates and links. Promotional prices must not exceed normal prices.' : message === 'INVALID_UPLOAD' ? 'Choose a valid PNG, JPEG or WebP image up to 5 MB, or a ZIP release up to 20 MB.' : 'Could not save this change. Please try again.' };
}
function versionValid(version: number) { if (!Number.isSafeInteger(version) || version < 0) throw new Error('VERSION_CONFLICT'); }
export async function saveSiteDraftAction(input: unknown, expectedVersion: number): Promise<SiteActionResult> {
  try {
    await requireAdminSession(); versionValid(expectedVersion);
    const config = validateSiteConfig(input);
    await validateConfigAssets(config);
    const version = await mutateSiteSettings('save', config, expectedVersion);
    revalidatePath('/admin');
    return { ok: true, version };
  } catch (error) { return safeError(error); }
}
export async function publishSiteAction(expectedVersion: number, note: string): Promise<SiteActionResult> {
  try {
    await requireAdminSession(); versionValid(expectedVersion);
    if (typeof note !== 'string' || note.trim().length > 300) throw new Error('INVALID_SITE_CONFIG');
    const state = await getSiteManagementData();
    if (state.version !== expectedVersion) throw new Error('VERSION_CONFLICT');
    await validateConfigAssets(validateSiteConfig(state.draft));
    const version = await mutateSiteSettings('publish', null, expectedVersion, note.trim());
    revalidatePath('/', 'layout');
    return { ok: true, version };
  } catch (error) { return safeError(error); }
}
export async function restoreSiteAction(historyId: string, expectedVersion: number): Promise<SiteActionResult> {
  try {
    await requireAdminSession(); versionValid(expectedVersion);
    if (typeof historyId !== 'string' || !/^[0-9a-f-]{36}$/.test(historyId)) throw new Error('INVALID_SITE_CONFIG');
    const version = await mutateSiteSettings('restore', null, expectedVersion, '', historyId);
    revalidatePath('/admin');
    return { ok: true, version };
  } catch (error) { return safeError(error); }
}
export async function uploadSiteAssetAction(form: FormData): Promise<SiteActionResult> {
  try {
    await requireAdminSession();
    const kind = form.get('kind'), file = form.get('file');
    if ((kind !== 'guide' && kind !== 'release') || !(file instanceof File)) throw new Error('INVALID_UPLOAD');
    const asset = await storeSiteAsset(file, kind);
    return { ok: true, assetId: asset.id, src: kind === 'guide' ? `/api/site/assets/${asset.id}` : undefined };
  } catch (error) { return safeError(error); }
}
export async function revokeKeyAction(id: string): Promise<SiteActionResult & { warning?: string }> {
  try {
    await requireAdminSession();
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('INVALID_SITE_CONFIG');
    const db = await getSiteAdminDatabase();
    // Conditional UPDATE prevents duplicate revocation and never releases stock.
    const { data, error } = await db.from('issued_licenses').update({ status: 'revoked' })
      .eq('id', id).eq('status', 'active').select('id').maybeSingle();
    if (error || !data) return { error: 'Could not revoke this license. It may already be revoked.' };
    let warning: string | undefined;
    // This schema has no revocation RPC; activity is a separate write. Report an
    // audit failure without asking the operator to repeat an already committed update.
    try { await recordSiteActivity('revoke_license', `Revoked issued license ${id}`); }
    catch { warning = 'License revoked. Activity logging is temporarily unavailable.'; }
    revalidatePath('/admin');
    return warning ? { ok: true, warning } : { ok: true };
  } catch (error) { return safeError(error); }
}

export async function prepareSiteUploadAction(kind: 'guide' | 'release', mime: string, size: number, name: string): Promise<SiteActionResult> {
  try {
    await requireAdminSession();
    if (kind !== 'guide' && kind !== 'release') throw new Error('INVALID_UPLOAD');
    const upload = await prepareSignedSiteUpload(kind, mime, size, name);
    return { ok: true, uploadId: upload.id, uploadUrl: upload.url, uploadMime: upload.mime };
  } catch (error) { return safeError(error); }
}
export async function completeSiteUploadAction(uploadId: string): Promise<SiteActionResult> {
  try {
    await requireAdminSession();
    const asset = await completeSignedSiteUpload(uploadId);
    return { ok: true, assetId: asset.id, src: asset.kind === 'guide' ? `/api/site/assets/${asset.id}` : undefined };
  } catch (error) { return safeError(error); }
}
