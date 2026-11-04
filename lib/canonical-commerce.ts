import { readStripeBody } from './stripe-server';
import 'server-only';
import { createClient } from '@supabase/supabase-js';
export const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export function orderCookie(id:string,token:string,request:Request) {
  return `ac-order-${id}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV==='production'||new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
export function canonicalUrl() {
  const url=process.env.SUPABASE_URL??'https://qckpwckfukyurkobrsig.supabase.co';
  const local=process.env.NODE_ENV!=='production'&&/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);
  if(url!=='https://qckpwckfukyurkobrsig.supabase.co'&&!local) throw Error('CANONICAL_PROJECT_REQUIRED');
  return url;
}
export function pricingDatabase() {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw Error('PRICING_NOT_CONFIGURED');
  return createClient(canonicalUrl(),key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,cache:'no-store'})}});
}
export async function canonicalCall(action:string,body:Record<string,unknown>,authorization:string,extraHeaders:Record<string,string>={}) {
  return fetch(canonicalUrl()+'/functions/v1/device-api',{method:'POST',headers:{...extraHeaders,'Content-Type':'application/json',Authorization:authorization},body:JSON.stringify({...body,action}),cache:'no-store',signal:AbortSignal.timeout(25000)});
}
export async function canonicalCheckout(request:Request,source:'stripe'|'toyyibpay') {
  try {
    const origin=process.env.APP_URL?new URL(process.env.APP_URL).origin:new URL(request.url).origin;
    if(request.headers.get('origin')!==origin) return Response.json({error:'INVALID_ORIGIN'},{status:403});
    if(!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'JSON_REQUIRED'},{status:415});
    const input=JSON.parse((await readStripeBody(request,16384)).toString('utf8'));
    if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['plan','buyer_email'].includes(k))) return Response.json({error:'INVALID_CHECKOUT'},{status:400});
    const mapping:Record<string,{plan:string;product:string}>={extension:{plan:'lifetime_license',product:'extension'},semester:{plan:'phone_notifications',product:'phone'},bundle:{plan:'bundle',product:'bundle'},yearly:{plan:'sem_subscription',product:'yearly'}};
    if(!Object.hasOwn(mapping,input.plan)||typeof input.buyer_email!=='string'||input.buyer_email.length>254||!/^\S+@\S+\.\S+$/.test(input.buyer_email)) return Response.json({error:'INVALID_CHECKOUT'},{status:400});
    const testing=process.env.NODE_ENV!=='production'&&process.env.COMMERCE_TEST_MODE==='true';
    if(process.env.PUBLIC_SALES_ENABLED!=='true'&&!testing)return Response.json({error:'sales_disabled'},{status:503,headers:privateHeaders});
    const token=request.headers.get('authorization')??'';
    if(token&&!/^Bearer [a-f0-9]{48,128}$/i.test(token))return Response.json({error:'unauthorized'},{status:401});
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!key)throw Error('CHECKOUT_UNAVAILABLE');
    const r=await canonicalCall('website-checkout',{...mapping[input.plan],source,currency:'myr',buyerEmail:input.buyer_email.trim().toLowerCase(),...(token?{deviceToken:token.slice(7)}:{})},'Bearer '+key);
    const data=await r.json();
    if(r.ok&&(!/^[a-f0-9-]{36}$/.test(data.orderId)||!/^[a-f0-9]{64}$/.test(data.orderAccessToken)))throw Error('INVALID_ORDER_DELIVERY');
    return Response.json(r.ok?{url:data.checkoutUrl,reference:data.orderId,amountMinor:data.amountMinor,currency:data.currency}:data,{status:r.status,headers:{...privateHeaders,...(r.ok?{'Set-Cookie':orderCookie(data.orderId,data.orderAccessToken,request)}:{})}});
  } catch {return Response.json({error:'CHECKOUT_UNAVAILABLE'},{status:503});}
}
export async function canonicalWebhook(request:Request,source:'stripe'|'toyyibpay') {
  try{
    const body=await readStripeBody(request,source==='stripe'?262144:8192);
    const headers=new Headers({'Content-Type':request.headers.get('content-type')??'application/json'});
    if(source==='stripe')headers.set('stripe-signature',request.headers.get('stripe-signature')??'');
    const r=await fetch(canonicalUrl()+'/functions/v1/payment-webhook?provider='+source,{method:'POST',headers,body:new Uint8Array(body),cache:'no-store',signal:AbortSignal.timeout(25000)});
    return new Response(await r.text(),{status:r.status,headers:{...privateHeaders,'Content-Type':'application/json'}});
  }catch{return Response.json({error:'WEBHOOK_UNAVAILABLE'},{status:503,headers:privateHeaders});}
}
