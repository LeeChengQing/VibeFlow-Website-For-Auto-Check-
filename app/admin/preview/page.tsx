import { getAdminSession } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import { getDraftSiteConfig } from '@/lib/site-settings';
import { Homepage } from '@/components/Homepage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Auto-Check · Draft preview', robots: { index: false, follow: false } };
export default async function PreviewPage() {
  let session;
  try { session = await getAdminSession(); } catch { /* redirect to setup/sign-in */ }
  if (!session) redirect('/admin');
  return <Homepage config={await getDraftSiteConfig()} preview />;
}
