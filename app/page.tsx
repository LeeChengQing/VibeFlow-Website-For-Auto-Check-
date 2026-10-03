import { Homepage } from '@/components/Homepage';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { connection } from 'next/server';

export default async function Home() {
  await connection();
  return <Homepage config={await getPublishedSiteConfig()} />;
}
