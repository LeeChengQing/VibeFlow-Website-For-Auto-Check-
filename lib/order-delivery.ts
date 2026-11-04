import 'server-only';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {pricingDatabase,canonicalCall,privateHeaders,orderCookie} from './canonical-commerce';
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function receiptToken(request:Request,id:string) {
  const value=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`ac-order-${id}=`))?.slice(`ac-order-${id}=`.length)??'';
  return /^[a-f0-9]{64}$/.test(value)?value:'';
}
export async function deliveryDevice(request:Request,db=pricingDatabase()) {
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{48,128})$/i)?.[1];
  if(!token)return null;
  const r=await db.from('devices').select('id').eq('auth_token_hash',hash(token)).maybeSingle();
  if(r.error)throw Error('order_unavailable');return r.data;
}
export async function ownedOrder(request:Request,id:unknown,db=pricingDatabase()) {
  if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return null;
  const token=receiptToken(request,id);
  const device=token?null:await deliveryDevice(request,db);
  if(!token&&!device)return null;
  let query=db.from('payment_orders').select('id,device_id,status,fulfillment_status,amount_minor,currency,product_type,phone_duration_days,release_asset_id,release_version');
  query=token?query.eq('order_access_token_hash',hash(token)):query.eq('device_id',device!.id);
  const result=await query.eq('id',id).maybeSingle();
  if(result.error)throw Error('order_unavailable');return result.data;
}

const cookie=(request:Request,name:string)=>(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)??'';
export async function deliveryAction(request:Request,input:Record<string,unknown>) {
  const headers=new Headers(privateHeaders),reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
  try {
    const origin=process.env.APP_URL?new URL(process.env.APP_URL).origin:process.env.NODE_ENV!=='production'?new URL(request.url).origin:'';
    if(!origin||request.headers.get('origin')!==origin)return reply({error:'forbidden'},403);
    const id=input.orderId;
    if(typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))return reply({error:'forbidden'},403);
    const action=({'buyer-session':'buyer-session','purchase-status':'purchase-status','reveal-license':'reveal-license','private-download':'private-download','claim-order':'claim-order','recovery-start':'commerce-recovery-start','recovery-complete':'commerce-recovery-complete'} as Record<string,string>)[String(input.action)];
    if(!action)return reply({error:'invalid_action'},400);
    const csrf=request.headers.get('x-commerce-csrf')??'';
    if(action!=='buyer-session'&&!/^[a-f0-9]{64}$/i.test(csrf))return reply({error:'forbidden'},403);
    const ip=request.headers.get('x-nf-client-connection-ip')??(process.env.NODE_ENV!=='production'?'127.0.0.1':'');
    if(!isIP(ip))return reply({error:'delivery_unavailable'},503);
    const [challengeId,recoveryProof]=cookie(request,`ac-recovery-${id}`).split('.');
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error();
    const r=await canonicalCall(action,{orderId:id,...(typeof input.email==='string'?{email:input.email}:{}),...(typeof input.code==='string'?{code:input.code}:{}),...(challengeId?{challengeId}:{})},'Bearer '+key,{
      Origin:origin,'X-Buyer-IP':ip,'X-Order-Receipt':receiptToken(request,id),'X-Buyer-Session':cookie(request,`ac-buyer-${id}`),'X-Commerce-CSRF':csrf,
      'X-Recovery-Proof':recoveryProof??'','X-Device-Proof':request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1]??'',
    });
    const data=await r.json();
    if(!r.ok){if(r.status===429)headers.set('Retry-After',r.headers.get('retry-after')??'60');return reply({error:r.status===429?'rate_limited':'delivery_unavailable'},r.status);}
    const secure=process.env.NODE_ENV==='production'||new URL(request.url).protocol==='https:'?'; Secure':'';
    const setCookie=(name:string,value:string,maxAge:number)=>headers.append('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
    if(action==='buyer-session') {if(!/^[a-f0-9]{64}$/.test(data.sessionToken)||!/^[a-f0-9]{64}$/.test(data.csrfToken))throw Error();setCookie(`ac-buyer-${id}`,data.sessionToken,900);return reply({csrfToken:data.csrfToken});}
    if(action==='commerce-recovery-start') {setCookie(`ac-recovery-${id}`,`${data.challengeId}.${data.recoveryToken}`,600);return reply({ok:true});}
    if(action==='commerce-recovery-complete') {if(!/^[a-f0-9]{64}$/.test(data.receiptToken))throw Error();headers.append('Set-Cookie',orderCookie(id,data.receiptToken,request));setCookie(`ac-recovery-${id}`,'',0);setCookie(`ac-buyer-${id}`,'',0);return reply({ok:true});}
    if(action==='reveal-license')return reply({licenseKey:data.licenseKey});
    if(action==='private-download')return reply({signedUrl:data.signedUrl});
    if(action==='claim-order')return reply({ok:true});
    const o=data.order;
    return reply({order:{id:o.id,device_id:o.device_id,status:o.status,fulfillment_status:o.fulfillment_status,amount_minor:o.amount_minor,currency:o.currency,product_type:o.product_type,phone_duration_days:o.phone_duration_days},hasLicense:!!data.hasLicense,downloadAvailable:!!data.downloadAvailable,needsClaim:!!data.needsClaim});
  }catch{return reply({error:'delivery_unavailable'},503);}
}
