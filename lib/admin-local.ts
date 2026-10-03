import 'server-only';
import { headers } from 'next/headers';
import { localOnly } from '@/lib/security';

export async function isLocalAdminPreview(): Promise<boolean> {
  if (process.env.NODE_ENV === 'production' || process.env.LOCAL_DEMO !== 'true') return false;
  const host = (await headers()).get('host');
  if (!host) return false;
  try {
    localOnly(new Request('http://localhost/admin/local', { headers: { host } }));
    return true;
  } catch { return false; }
}
