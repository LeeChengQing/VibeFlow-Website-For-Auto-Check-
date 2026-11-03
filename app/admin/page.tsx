import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdminSession } from '@/lib/admin-auth';
import { getPluginLicenseData } from '@/lib/plugin-license-admin';
import type { PluginSearchParams } from '@/lib/plugin-license-types';
import { isLocalAdminPreview } from '@/lib/admin-local';
import { AdminLoginForm } from './AdminLoginForm';
import { PluginLicensePanel } from './PluginLicensePanel';
import { SiteManagementDashboard } from './SiteManagementDashboard';
import { getSiteManagementData } from '@/lib/site-settings';
import { getSiteOperations } from '@/lib/site-operations';
import { OperationsPanel, OperationsOverview } from './OperationsPanel';
import { adminSurface, glassPanel } from './admin-ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Auto-Check · Site management', robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<PluginSearchParams> }) {
  const showLocalPreview = await isLocalAdminPreview();
  let session;
  try { session = await getAdminSession(); }
  catch {
    return <section className={adminSurface}><div className={`${glassPanel} p-8`}>
      <h1 className="text-2xl font-semibold">Admin unavailable</h1>
      <p role="alert" className="mt-4! text-sm leading-6 text-white/70">Admin access is not configured. Please contact the site operator.</p>
      {showLocalPreview && <Link href="/admin/local" prefetch={false} className="mt-5 inline-block text-sm text-cyan-200">Local demo</Link>}
    </div></section>;
  }
  if (!session) return <AdminLoginForm showLocalPreview={showLocalPreview} />;
  let data = null;
  try { data = await getPluginLicenseData(await searchParams); }
  catch { /* Preserve the dashboard instance and one-time modal during read failures. */ }
  const inventory = <PluginLicensePanel data={data} />;
  let management = null;
  let operations = { local: false, orders: [], tickets: [] } as Awaited<ReturnType<typeof getSiteOperations>>;
  const [settingsResult, operationsResult] = await Promise.allSettled([getSiteManagementData(), getSiteOperations()]);
  if (settingsResult.status === 'fulfilled') management = settingsResult.value;
  if (operationsResult.status === 'fulfilled') operations = operationsResult.value;
  return <SiteManagementDashboard management={management} operations={<OperationsPanel data={operations} />} overview={<><OperationsOverview data={operations} />{data && <p className="text-sm text-cyan-200">{data.total} plugin licenses</p>}</>}>{inventory}</SiteManagementDashboard>;
}
