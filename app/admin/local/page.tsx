import { notFound } from 'next/navigation';
import { AdminDashboard } from '@/components/AdminDashboard';
import { isLocalAdminPreview } from '@/lib/admin-local';

export default async function LocalAdminPage() {
  if (!await isLocalAdminPreview()) notFound();
  return <AdminDashboard />;
}
