import { Homepage } from '@/components/Homepage';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { connection } from 'next/server';

export default async function Home({ searchParams }: {
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  await connection();
  const params = await searchParams;
  const initialProduct = params.product === 'mobile_notification' ? 'notification' : 'bundle';
  return <Homepage config={await getPublishedSiteConfig()} initialProduct={initialProduct} />;
}
