import { Homepage } from '@/components/Homepage';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import type { NotificationBillingPlan } from '@/lib/plans';
import { connection } from 'next/server';

export default async function Home({ searchParams }: {
  searchParams: Promise<{ product?: string | string[]; billing?: string | string[] }>;
}) {
  await connection();
  const params = await searchParams;
  const initialProduct = params.product === 'mobile_notification' ? 'notification' : 'bundle';
  const initialBillingPlan: NotificationBillingPlan | undefined = params.billing === 'semester' || params.billing === 'yearly' ? params.billing : undefined;
  return <Homepage config={await getPublishedSiteConfig()} initialProduct={initialProduct} initialBillingPlan={initialBillingPlan} />;
}
