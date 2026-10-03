import { Homepage } from '@/components/Homepage';
import { getPublishedSiteConfig } from '@/lib/site-settings';

export default async function Home() {
  return <Homepage config={await getPublishedSiteConfig()} />;
}
