import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServerModule } from './helpers/server-module';
import { mobilePricing } from '../lib/mobile-pricing';
import { DEFAULT_SITE_CONFIG } from '../lib/site-config';

test('bundle savings compare the current canonical standalone prices',()=>{
  const config=structuredClone(DEFAULT_SITE_CONFIG);
  for(const p of config.packages)p.canonicalEffectiveAmount=({bundle:2690,extension:1990,mobile_notification:990,mobile_notification_yearly:1999})[p.id];
  assert.equal(mobilePricing(config,0).bundle.separate,2980);
});
const readStripeBody=async(r:Request,max:number)=>{const b=Buffer.from(await r.text());if(b.length>max)throw Error('BODY_TOO_LARGE');return b;};
const request=(body:unknown,origin='https://shop.example')=>new Request('https://shop.example/api/admin/pricing',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify(body)});
function admin(authorized=true){
  const calls:unknown[]=[];
  const draft=structuredClone(DEFAULT_SITE_CONFIG),published=structuredClone(DEFAULT_SITE_CONFIG);
  const route=loadServerModule<typeof import('../app/api/admin/pricing/route')>('app/api/admin/pricing/route.ts',{
    '@/lib/admin-auth':{requireAdminSession:async()=>{if(!authorized)throw Error('UNAUTHORIZED');return {issuedAt:12345,expiresAt:99999};}},
    '@/lib/site-settings':{getSiteManagementData:async()=>({draft,published,version:3,history:[]}),mutateSiteSettings:async(operation:string,config:unknown,version:number)=>{calls.push({operation,config,version});}},
    '@/lib/stripe-server':{readStripeBody}
  },{process:{env:{}},Response,Request,Error,structuredClone});
  return {route,calls,draft,published};
}
test('pricing admin rejects unauthenticated GET and POST before any database write',async()=>{
  const {route,calls}=admin(false);
  assert.equal((await route.GET()).status,401);assert.equal((await route.POST(request({}))).status,401);assert.equal(calls.length,0);
});
test('pricing admin rejects cross-origin and invalid money values',async()=>{
  const {route,calls}=admin();
  assert.equal((await route.POST(request({},'https://attacker.example'))).status,403);
  for(const values of [{regular_amount_minor:1.5},{regular_amount_minor:-100},{enabled:'true'},{starts_at:'2030-01-01T00:00'}]){
    assert.equal((await route.POST(request({kind:'product',id:'extension:myr',version:3,values}))).status,400);
  }assert.equal(calls.length,0);
});
test('pricing admin saves only draft with optimistic version and exact integer money',async()=>{
  const {route,calls}=admin();
  assert.equal((await route.POST(request({kind:'product',id:'bundle:myr',version:3,values:{regular_amount_minor:4100}}))).status,200);
  assert.equal((calls[0] as any).operation,'save');assert.equal((calls[0] as any).version,3);assert.equal((calls[0] as any).config.packages.find((p:any)=>p.id==='bundle').amount,4100);
  const loaded=await (await route.GET()).json();assert.equal(loaded.products.find((p:any)=>p.id==='bundle:myr').regular_amount_minor,DEFAULT_SITE_CONFIG.packages.find(p=>p.id==='bundle')!.amount);
});

test('pricing admin reads the existing published and draft configuration without pricing RPCs',async()=>{
  const {route}=admin();const response=await route.GET();assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.source,'site_configuration');assert.equal(data.products.length,4);assert.equal(data.campaign.state,'expired');assert.equal(data.draft_campaign.id,'site-offer');
});

test('pricing admin independently reports scheduled draft and expired published campaign',async()=>{
  const {route,draft,published}=admin();
  draft.offer={...draft.offer,enabled:true,startsAt:'2099-01-01T00:00:00+08:00',endsAt:'2099-01-02T00:00:00+08:00'};
  published.offer={...published.offer,enabled:true,startsAt:'2026-10-04T00:00:00+08:00',endsAt:'2026-10-15T23:59:00+08:00'};
  const data=await (await route.GET()).json();
  assert.equal(data.draft_campaign.state,'scheduled');assert.equal(data.campaign.state,'expired');
});

test('pricing admin rejects stale versions and invalid campaign windows without saving',async()=>{
  const {route,calls}=admin();
  assert.equal((await route.POST(request({kind:'campaign',id:'site-offer',version:2,values:{enabled:true}}))).status,409);
  assert.equal((await route.POST(request({kind:'campaign',id:'site-offer',version:3,values:{starts_at:'2030-01-02T00:00:00+08:00',ends_at:'2030-01-01T00:00:00+08:00'}}))).status,400);assert.equal(calls.length,0);
});
test('website checkout rejects forged prices, accepts guests and saves an HttpOnly order credential',async()=>{
  const calls:any[]=[];
  const commerce=loadServerModule<typeof import('../lib/canonical-commerce')>('lib/canonical-commerce.ts',{
    './stripe-server':{readStripeBody},'@supabase/supabase-js':{}
  },{process:{env:{COMMERCE_TEST_MODE:'true',SUPABASE_SERVICE_ROLE_KEY:'local-service'}},Response,Request,AbortSignal,fetch:async(url:string,init:RequestInit)=>{calls.push({url,body:JSON.parse(String(init.body)),headers:init.headers});return Response.json({checkoutUrl:'https://checkout.stripe.com/c/pay/local',orderId:'11111111-1111-4111-8111-111111111111',orderAccessToken:'b'.repeat(64),amountMinor:2690,currency:'myr'});}});
  assert.equal((await commerce.canonicalCheckout(request({plan:'bundle',buyer_email:'buyer@example.test',amountMinor:1}),'stripe')).status,400);
  const result=await commerce.canonicalCheckout(request({plan:'bundle',buyer_email:'buyer@example.test'}),'stripe');
  assert.equal(result.status,200);assert.equal((await result.json()).amountMinor,2690);assert.equal(calls[0].body.plan,'bundle');assert.equal(calls[0].body.action,'website-checkout');assert.equal(calls[0].body.currency,'myr');
  const unauth=new Request('https://shop.example/api/checkout',{method:'POST',headers:{Origin:'https://shop.example','Content-Type':'application/json'},body:JSON.stringify({plan:'bundle',buyer_email:'buyer@example.test'})});
  const guest=await commerce.canonicalCheckout(unauth,'stripe');assert.equal(guest.status,200);assert.match(guest.headers.get('set-cookie')??'',/HttpOnly; SameSite=Lax/);assert.equal(calls[1].body.deviceToken,undefined);assert.equal((await guest.json()).orderAccessToken,undefined);
});
