import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { canonicalUrl } from '@/lib/canonical-commerce';
import { generateOrderAccessToken, hashOrderAccessToken, pluginProof, readOrderCookie } from '@/lib/order-access-token';
import { readStripeBody } from '@/lib/stripe-server';
import { commerceDatabase, commerceOrigin, isOrderId, ownedUnifiedOrder, reply, signOrderDownload, unifiedHeaders } from '@/lib/unified-commerce';

type PluginOrder={id:string;order_access_token_hash:string};
export type LatestPluginRelease={version:string;date:string;notes:{zh:string;en:string};sha256:string};

export function isPluginSchemaUnavailable(error: {code?: string} | null | undefined) {
  return ['42P01','42883','PGRST200','PGRST202','PGRST205'].includes(error?.code ?? '');
}

const pluginCookie='__Host-ac-plugin-order';
const sessionSeconds=900;
export function createPluginOrderSession(order:PluginOrder) {
  const expires=String(Math.floor(Date.now()/1000)+sessionSeconds);
  const signature=pluginProof('session',order.id,expires,order.order_access_token_hash);
  return pluginCookie+'='+[order.id,expires,signature].join('.')+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+sessionSeconds;
}

export async function resolvePluginOrder(request:Pick<Request,'headers'>):Promise<PluginOrder|null> {
  const [id,expires,signature,extra]=readOrderCookie(request.headers,pluginCookie).split('.');
  const db=commerceDatabase();
  const lookup=async (orderId:string)=>{
    const {data,error}=await db.rpc('plugin_order_session',{p_order_id:orderId});
    if(isPluginSchemaUnavailable(error))return null;
    if(error)throw Error('order_unavailable');
    return data as PluginOrder|null;
  };
  if(isOrderId(id)&&/^\d{10}$/.test(expires??'')&&Number(expires)>Math.floor(Date.now()/1000)&&
    /^[a-f0-9]{64}$/.test(signature??'')&&extra===undefined){
    const order=await lookup(id);
    if(order){
      const expected=pluginProof('session',id,expires,order.order_access_token_hash);
      if(timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return order;
    }
  }
  const ids=(request.headers.get('cookie')??'').split(';').map(value=>value.trim().match(/^ac-order-([a-f0-9-]{36})=/i)?.[1]).filter(isOrderId).slice(0,4);
  for(const orderId of ids){
    const owned=await ownedUnifiedOrder(request,orderId);
    if(owned){
      const order=await lookup(orderId);
      if(order?.order_access_token_hash===owned.order_access_token_hash)return order;
    }
  }
  return null;
}

export async function getLatestPluginRelease():Promise<LatestPluginRelease|null> {
  const {data,error}=await commerceDatabase().from('current_stable')
    .select('plugin_release!inner(version,created_at,notes_zh,notes_en,sha256)')
    .eq('plugin_release.status','published').maybeSingle();
  if(isPluginSchemaUnavailable(error))return null;
  if(error)throw Error('release_unavailable');
  const release=data?.plugin_release;
  return release?{version:release.version,date:release.created_at,
    notes:{zh:release.notes_zh,en:release.notes_en},sha256:release.sha256}:null;
}

export const forbiddenDownload = () => reply({error:'forbidden'},403);
const unavailableDownload = () => reply({error:'delivery_unavailable'},503);

export async function issuePluginDownload(request:Request) {
  try {
    if(request.headers.get('origin')!==commerceOrigin() || !request.headers.get('content-type')?.startsWith('application/json'))return forbiddenDownload();
    let input: {orderId?:unknown}|null;
    try { input=JSON.parse((await readStripeBody(request,4096)).toString('utf8')); }
    catch { return forbiddenDownload(); }
    if(!input||typeof input!=='object'||Array.isArray(input))return forbiddenDownload();
    if(input.orderId!==undefined&&!isOrderId(input.orderId))return forbiddenDownload();
    const order=input.orderId?await ownedUnifiedOrder(request,input.orderId):await resolvePluginOrder(request);
    if(!order)return forbiddenDownload();
    const {token,tokenHash}=generateOrderAccessToken();
    const {data:version,error}=await commerceDatabase().rpc('issue_plugin_download',{
      p_order_id:order.id,p_receipt_hash:order.order_access_token_hash,p_token_hash:tokenHash,
    });
    if(error)return isPluginSchemaUnavailable(error)?forbiddenDownload():unavailableDownload();
    return version ? reply({url:'/api/plugin/download/'+token,version}) : forbiddenDownload();
  }catch{return unavailableDownload();}
}

export async function redeemPluginDownload(request:Request,token:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return forbiddenDownload();
  try {
    const ip=request.headers.get('cf-connecting-ip')??'';
    const db=commerceDatabase();
    const {data:release,error}=await db.rpc('consume_plugin_download',{
      p_token_hash:hashOrderAccessToken(token),p_ip:isIP(ip)?ip:null,p_ua:request.headers.get('user-agent')?.slice(0,512)??null,
    });
    if(error)return isPluginSchemaUnavailable(error)?forbiddenDownload():unavailableDownload();
    if(!release)return forbiddenDownload();

    const bucket=await db.storage.getBucket('site-assets');
    if(bucket.error||bucket.data?.public!==false)return unavailableDownload();
    const signed=await signOrderDownload(db,release.storageKey,60);
    if(!signed)return unavailableDownload();
    const url=new URL(signed);
    if(url.origin!==canonicalUrl()||!url.pathname.startsWith('/storage/v1/object/sign/site-assets/'))return unavailableDownload();
    const file=await fetch(url,{cache:'no-store',redirect:'error',signal:request.signal});
    if(!file.ok||!file.body)return unavailableDownload();
    return new Response(file.body,{headers:{
      ...unifiedHeaders,
      'Content-Type':'application/zip',
      'Content-Disposition':'attachment; filename="Soton-Auto-Check-'+release.version+'.zip"',
      'X-Content-Type-Options':'nosniff',
      'X-Content-SHA256':release.sha256,
      'Access-Control-Expose-Headers':'X-Content-SHA256',
    }});
  }catch{return unavailableDownload();}
}
