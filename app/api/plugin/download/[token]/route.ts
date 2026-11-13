import { forbiddenDownload, redeemPluginDownload } from '@/lib/plugin-download';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const HEAD=forbiddenDownload;
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
  return redeemPluginDownload(request,(await params).token);
}
