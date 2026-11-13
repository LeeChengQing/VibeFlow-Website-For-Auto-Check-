import { getLatestPluginRelease } from '@/lib/plugin-download';
import { reply } from '@/lib/unified-commerce';
export const dynamic='force-dynamic';
export async function GET(){
  try {
    const release=await getLatestPluginRelease();
    return release?reply(release):reply({error:'unavailable'},404);
  }catch{return reply({error:'unavailable'},503);}
}
