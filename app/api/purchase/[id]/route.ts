import {decryptLicenseKey} from '@/lib/license-key-encryption';
import {commerceDatabase,commerceOrigin,ownedUnifiedOrder,reply,signOrderDownload} from '@/lib/unified-commerce';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
  try{
    const order=await ownedUnifiedOrder(request,(await context.params).id);
    if(!order)return reply({error:'ORDER_ACCESS_REQUIRED'},403);
    return reply({status:order.status,plan:order.plan,amountMinor:order.amount_minor,currency:order.currency,downloadAvailable:order.status==='paid'&&!!order.release_asset_id&&Date.parse(order.paid_at)+7*86400000>Date.now(),hasLicense:order.status==='paid'&&['extension','bundle'].includes(order.plan)});
  }catch{return reply({error:'ORDER_UNAVAILABLE'},503);}
}
export async function POST(request:Request,context:Context){
  if(request.headers.get('origin')!==commerceOrigin()||!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'forbidden'},403);
  try{
    const order=await ownedUnifiedOrder(request,(await context.params).id);
    if(!order||order.status!=='paid')return reply({error:'ORDER_ACCESS_REQUIRED'},403);
    const {action}=await request.json(),db=commerceDatabase();
    if(action==='reveal'){
      const {data:license,error}=await db.from('plugin_licenses').select('license_key_hash,license_key_ciphertext,status').eq('payment_order_id',order.id).maybeSingle();
      if(error||!license||license.status!=='active'||!license.license_key_ciphertext)return reply({error:'LICENSE_UNAVAILABLE'},409);
      return reply({licenseKey:decryptLicenseKey(license.license_key_ciphertext,license.license_key_hash)});
    }
    if(action==='download'&&order.release_asset_id&&Date.parse(order.paid_at)+7*86400000>Date.now()){
      const {data:asset,error}=await db.from('site_assets').select('object_path').eq('id',order.release_asset_id).eq('kind','release').maybeSingle();
      if(error||!asset)return reply({error:'DOWNLOAD_UNAVAILABLE'},503);
      const url=await signOrderDownload(db,asset.object_path,300);
      if(!url)return reply({error:'DOWNLOAD_UNAVAILABLE'},503);
      return reply({url});
    }
    return reply({error:'INVALID_ACTION'},400);
  }catch{return reply({error:'ORDER_UNAVAILABLE'},503);}
}
