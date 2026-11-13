import { headers } from 'next/headers';
import { getLatestPluginRelease, resolvePluginOrder } from '@/lib/plugin-download';
import { PluginDownloadPanel } from './panel';

export const dynamic='force-dynamic';
export const metadata={title:'Auto-Check Download',robots:{index:false,follow:false}};
export default async function PluginDownloadPage(){
  const order=await resolvePluginOrder({headers:await headers()}).catch(()=>null);
  const release=order?await getLatestPluginRelease().catch(()=>null):null;
  return <PluginDownloadPanel signedIn={!!order} release={release}/>;
}
