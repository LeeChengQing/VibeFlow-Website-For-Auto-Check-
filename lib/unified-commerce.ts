import 'server-only';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {readOrderCookie} from '@/lib/order-access-token';
import {getPublishedSiteConfig} from '@/lib/site-settings';
import {packagePrice,purchaseAllowed} from '@/lib/site-config';
import {getCommerceDatabase} from '@/lib/supabase/commerce';
import {getStripe,readStripeBody} from '@/lib/stripe-server';
import {encryptLicenseKey} from '@/lib/license-key-encryption';
import {generatePluginLicenseKey} from '@/lib/plugin-license-key';
import {configuredPaymentProviders,publicSalesEnabled} from '@/lib/payments/provider-status';

export const unifiedHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const isOrderId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export const commerceDatabase=()=>getCommerceDatabase() as any;
export const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:unifiedHeaders});
export async function signOrderDownload(db:ReturnType<typeof commerceDatabase>,storageKey:string,seconds:number) {
  const signed=await db.storage.from('site-assets').createSignedUrl(storageKey,seconds);
  return signed.error?null:signed.data?.signedUrl??null;
}
export const commerceOrigin=()=>new URL(process.env.APP_URL??'https://vf-auto-check.vercel.app').origin;
export function internalCheckoutAuthorized(request:Request) {
  const actual=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from('Bearer '+(process.env.SUPABASE_SERVICE_ROLE_KEY??''));
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY&&actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function fail(code:string,status:number):never{throw Object.assign(Error(code),{status});}

function logCheckoutFailure(stage:string,code:string,error?:unknown) {
  const name=error instanceof Error?error.name:'Error';
  const safeNames=['Error','TypeError','RangeError','StripeError','StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError','StripeConnectionError','StripeAPIError','StripeRateLimitError'];
  console.error(JSON.stringify({stage,code,name:safeNames.includes(name)?name:'Error'}));
}

function validateCheckoutEncryptionKey() {
  const key=process.env.LICENSE_KEY_ENCRYPTION_KEY?.trim();
  let reason:string;
  if(!key)reason='missing';
  else if(/[^A-Za-z0-9+/=]/.test(key))reason='bad_charset';
  else if(key.length!==44)reason='bad_length';
  else if(!/^[A-Za-z0-9+/]{43}=$/.test(key))reason='bad_charset';
  else if(Buffer.from(key,'base64').length!==32)reason='not_32_bytes';
  else return;
  logCheckoutFailure('key_format',reason);
  fail('CHECKOUT_UNAVAILABLE',503);
}

export async function createUnifiedCheckout(request:Request,provider:'stripe'|'toyyibpay',deviceId:string|null=null,verification=false) {
  let orderId:string|undefined;
  try {
    const origin=commerceOrigin();
    if(request.headers.get('origin')!==origin)fail('INVALID_ORIGIN',403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);
    const input=JSON.parse((await readStripeBody(request,16384)).toString('utf8'));
    const mapping:Record<string,string>={extension:'extension',bundle:'bundle',semester:'mobile_notification',yearly:'mobile_notification_yearly'};
    if(!input||!Object.hasOwn(mapping,input.plan))fail('INVALID_CHECKOUT',400);
    if(input.terms_accepted!==true||input.terms_version&&input.terms_version!=='2026-10-06')fail('TERMS_ACCEPTANCE_REQUIRED',400);
    if(['semester','yearly'].includes(input.plan)&&!deviceId)fail('USE_EXTENSION_FOR_PHONE',403);
    const email=typeof input.buyer_email==='string'?input.buyer_email.trim().toLowerCase():'';
    if((!deviceId||email)&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))fail('INVALID_EMAIL',400);
    if(!verification&&!publicSalesEnabled())fail('CHECKOUT_UNAVAILABLE',503);
    if(!configuredPaymentProviders().includes(provider))fail('PROVIDER_NOT_CONFIGURED',503);
    const config=await getPublishedSiteConfig();
    if(verification){
      const fixture=await commerceDatabase().from('devices').select('device_key').eq('id',deviceId).maybeSingle();
      if(!fixture.data?.device_key?.startsWith('verification-')||email!=='checkout-verification@example.invalid')fail('INVALID_VERIFICATION_DEVICE',403);
    }
    const available=verification?!config.settings.maintenance&&config.packages.some(p=>p.id===mapping[input.plan]&&p.enabled&&p.visible):purchaseAllowed(config,mapping[input.plan] as any);
    if(!available)fail('CHECKOUT_UNAVAILABLE',409);
    const price=packagePrice(config,mapping[input.plan] as any);
    if(!Number.isSafeInteger(price)||price<100)fail('INVALID_PRICE',503);
    const plugin=['extension','bundle'].includes(input.plan),release=config.settings.extensionRelease;
    if(plugin&&!release?.assetId)fail('RELEASE_NOT_CONFIGURED',503);
    if(deviceId){const licensed=await commerceDatabase().rpc('validate_device_plugin_license',{p_device_id:deviceId});if(licensed.error||licensed.data?.licensed!==true)fail('PLUGIN_LICENSE_REQUIRED',403);}
    if(plugin){
      validateCheckoutEncryptionKey();
      try {
        encryptLicenseKey('configuration-check',digest('configuration-check'));
      } catch(error) {
        logCheckoutFailure('encryption_preflight','ENCRYPTION_FAILED',error);
        fail('CHECKOUT_UNAVAILABLE',503);
      }
    }
    const token=generatePluginLicenseKey()+generatePluginLicenseKey();
    orderId=randomUUID();
    const db=commerceDatabase(),row={id:orderId,plan:input.plan,device_id:deviceId,buyer_email:email,amount_minor:price,currency:'MYR',payment_provider:provider,phone_duration_days:input.plan==='yearly'?365:input.plan==='extension'?0:130,order_access_token_hash:digest(token),release_asset_id:plugin?release!.assetId:null,terms_version:'2026-10-06',terms_accepted_at:new Date().toISOString(),verification_only:verification};
    try {
      const inserted=await db.from('payment_orders').insert(row);
      if(inserted.error)throw inserted.error;
    } catch(error) {
      logCheckoutFailure('payment_orders_insert','ORDER_CREATE_FAILED',error);
      fail('CHECKOUT_UNAVAILABLE',503);
    }
    let providerId:string,url:string;
    if(provider==='stripe') {
      try {
        const session=await getStripe().checkout.sessions.create({mode:'payment',allowed_payment_method_types:['card','fpx','alipay'],...(email?{customer_email:email}:{}),client_reference_id:orderId,metadata:{order_id:orderId},payment_intent_data:{metadata:{order_id:orderId}},line_items:[{quantity:1,price_data:{currency:'myr',unit_amount:price,product_data:{name:config.packages.find(p=>p.id===mapping[input.plan])!.name.en}}}],success_url:`${origin}/success?order_id=${orderId}`,cancel_url:`${origin}/#pricing`},{idempotencyKey:'checkout-'+orderId});
        console.info('[checkout-methods]',{provider:'stripe',methods:session.payment_method_types});
        providerId=session.id;url=session.url??'';
        if(!url.startsWith('https://checkout.stripe.com/'))fail('INVALID_SESSION_URL',502);
      } catch(error) {
        logCheckoutFailure('stripe_session_create','STRIPE_SESSION_CREATE_FAILED',error);
        fail('CHECKOUT_UNAVAILABLE',503);
      }
    } else {
      const secret=process.env.TOYYIBPAY_SECRET_KEY,category=process.env.TOYYIBPAY_CATEGORY_CODE;
      if(!secret||!category)fail('TOYYIBPAY_NOT_CONFIGURED',503);
      const fields=new URLSearchParams({userSecretKey:secret,categoryCode:category,billName:'Auto Check '+input.plan,billDescription:'Auto Check '+input.plan,billPriceSetting:'1',billPayorInfo:'0',billDisplayMerchant:'0',billAmount:String(price),billReturnUrl:`${origin}/success?order_id=${orderId}`,billCallbackUrl:`${origin}/api/webhook/toyyibpay`,billExternalReferenceNo:orderId,...(email?{billEmail:email}:{}),enableDuitNowQR:'1',chargeDuitNowQR:'0'});
      const response=await fetch('https://toyyibpay.com/index.php/api/createBill',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fields,signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
      const data=JSON.parse((await response.text()).replace(/^\uFEFF/,''));
      if(!response.ok||!Array.isArray(data)||!/^[A-Za-z0-9_-]{2,64}$/.test(data[0]?.BillCode??''))fail('PAYMENT_PROVIDER_UNAVAILABLE',502);
      providerId=data[0].BillCode;url='https://toyyibpay.com/'+providerId;
    }
    const saved=await db.from('payment_orders').update({provider_request_id:providerId}).eq('id',orderId);
    if(saved.error)fail('ORDER_SAVE_FAILED',503);
    return Response.json({url,reference:orderId},{headers:{...unifiedHeaders,'Set-Cookie':`ac-order-${orderId}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure`}});
  } catch(error) {
    if(orderId){
      try {
        await commerceDatabase().from('payment_orders').update({status:'cancelled'}).eq('id',orderId).eq('status','pending');
      } catch {
        // Preserve the original checkout response if order cleanup also fails.
      }
    }
    return reply({error:error instanceof Error&&'status' in error?error.message:'CHECKOUT_UNAVAILABLE'},Number((error as {status?:number})?.status)||503);
  }
}

export async function fulfillUnifiedOrder(order:any,payment:string,amount:number,currency:string,providerRequest=order.provider_request_id) {
  const key=generatePluginLicenseKey(),hash=digest(key);
  const result=await commerceDatabase().rpc('fulfill_verified_payment',{p_order:order.id,p_provider:order.payment_provider,p_request:providerRequest,p_payment:payment,p_amount:amount,p_currency:currency.toUpperCase(),p_key_hash:hash,p_key_ciphertext:encryptLicenseKey(key,hash)});
  if(result.error)throw Error('PAYMENT_FULFILLMENT_FAILED');
  return result.data;
}

export async function ownedUnifiedOrder(request:Pick<Request,'headers'>,id:string) {
  if(!isOrderId(id))return null;
  const token=readOrderCookie(request.headers,`ac-order-${id}`);
  if(!token||token.length>256)return null;
  const {data,error}=await commerceDatabase().from('payment_orders').select('*').eq('id',id).eq('order_access_token_hash',digest(token)).maybeSingle();
  if(error)throw Error('ORDER_UNAVAILABLE');return data;
}
