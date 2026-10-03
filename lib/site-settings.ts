import 'server-only';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { requireAdminSession } from './admin-auth';
import { DEFAULT_SITE_CONFIG, validateSiteConfig, type SiteConfig, type SiteManagementData } from './site-config';

export async function isLocalSiteManagement(): Promise<boolean> {
  if (process.env.NODE_ENV === 'production' || process.env.SITE_MANAGEMENT_LOCAL !== 'true' || process.env.LOCAL_DEMO !== 'true') return false;
  const host = (await headers()).get('host');
  if (!host) return false;
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname); } catch { return false; }
}

// Private service-role reader. Public callers receive validated published settings only.
function serviceClient() {
  const raw = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!raw || !key) throw new Error('SITE_NOT_CONFIGURED');
  const url = new URL(raw);
  const local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SITE_NOT_CONFIGURED');
  return createClient(url.origin, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } });
}
export async function getSiteAdminDatabase() { await requireAdminSession(); return serviceClient(); }
export async function getPublishedSiteConfig(): Promise<SiteConfig> {
  if (await isLocalSiteManagement()) return (await import('./site-local-store')).readLocalPublished();
  // Preserve the original unconfigured local storefront; never mask a configured DB outage.
  if (!process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY) return structuredClone(DEFAULT_SITE_CONFIG);
  const { data, error } = await serviceClient().from('site_configuration').select('published').eq('id', 1).single();
  if (error || !data) throw new Error('SITE_SETTINGS_UNAVAILABLE');
  return validateSiteConfig(data.published);
}
export async function getSiteManagementData(): Promise<SiteManagementData> {
  await requireAdminSession();
  if (await isLocalSiteManagement()) return (await import('./site-local-store')).readLocalManagement();
  const db = serviceClient();
  const results = await Promise.all([
    db.from('site_configuration').select('draft,published,version').eq('id', 1).single(),
    db.from('site_revisions').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('site_activity').select('id,action,detail,created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  if (results.some(result => result.error) || !results[0].data) throw new Error('SITE_SETTINGS_UNAVAILABLE');
  const state = results[0].data;
  return { draft: validateSiteConfig(state.draft), published: validateSiteConfig(state.published), version: Number(state.version), local: false,
    history: (results[1].data ?? []).map(row => ({ id: row.id, version: Number(row.version), createdAt: row.created_at, note: row.note, config: validateSiteConfig(row.config) })),
    activity: (results[2].data ?? []).map(row => ({ id: row.id, createdAt: row.created_at, action: row.action, detail: row.detail })) };
}
export async function getDraftSiteConfig() { return (await getSiteManagementData()).draft; }
export async function mutateSiteSettings(operation: 'save' | 'publish' | 'restore', config: SiteConfig | null, expectedVersion: number, note = '', historyId: string | null = null): Promise<number> {
  await requireAdminSession();
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('VERSION_CONFLICT');
  if (await isLocalSiteManagement()) return (await import('./site-local-store')).mutateLocalSettings(operation, config, expectedVersion, note, historyId);
  const { data, error } = await serviceClient().rpc('manage_site_configuration', { p_operation: operation, p_config: config, p_expected_version: expectedVersion, p_note: note, p_history_id: historyId });
  if (error) throw new Error(error.message.includes('VERSION_CONFLICT') ? 'VERSION_CONFLICT' : 'SITE_SETTINGS_UNAVAILABLE');
  return Number(data);
}
export async function recordSiteActivity(action: string, detail: string): Promise<void> {
  await requireAdminSession();
  if (await isLocalSiteManagement()) { (await import('./site-local-store')).appendLocalActivity(action, detail); return; }
  const { error } = await serviceClient().from('site_activity').insert({ action: action.slice(0, 100), detail: detail.slice(0, 500) });
  if (error) throw new Error('SITE_SETTINGS_UNAVAILABLE');
}
// Called only by the server asset delivery module after access is checked.
export async function readSiteAssetRecord(id: string) {
  if (await isLocalSiteManagement()) return (await import('./site-local-store')).readLocalAsset(id);
  const { data, error } = await serviceClient().from('site_assets').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('SITE_ASSET_UNAVAILABLE');
  if (!data) return null;
  return { id: data.id as string, kind: data.kind as 'guide' | 'release', mime: data.mime as string, size: Number(data.size), name: data.name as string, objectPath: data.object_path as string, createdAt: data.created_at as string };
}
export async function downloadSiteObject(path: string): Promise<Blob> {
  const { data, error } = await serviceClient().storage.from('site-assets').download(path);
  if (error || !data) throw new Error('SITE_ASSET_UNAVAILABLE');
  return data;
}
