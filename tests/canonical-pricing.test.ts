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
  const route=loadServerModule<typeof import('../app/api/admin/pricing/route')>('app/api/admin/pricing/route.ts',{
    '@/lib/admin-auth':{requireAdminSession:async()=>{if(!authorized)throw Error('UNAUTHORIZED');return {issuedAt:12345,expiresAt:99999};}},
    '@/lib/canonical-commerce':{pricingDatabase:()=>({rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data:{},error:null};}})},
    '@/lib/stripe-server':{readStripeBody}
  },{process:{env:{}},Response,Request,Error});
  return {route,calls};
}
test('pricing admin rejects unauthenticated GET and POST before any database write',async()=>{
  const {route,calls}=admin(false);
  assert.equal((await route.GET()).status,401);assert.equal((await route.POST(request({}))).status,401);assert.equal(calls.length,0);
});
test('pricing admin rejects cross-origin and invalid money values',async()=>{
  const {route,calls}=admin();
  assert.equal((await route.POST(request({},'https://attacker.example'))).status,403);
  for(const values of [{regular_amount_minor:1.5},{regular_amount_minor:-100},{enabled:'true'},{starts_at:'2030-01-01T00:00'}]){
    assert.equal((await route.POST(request({kind:'product',id:'extension:myr',version:1,values}))).status,400);
  }assert.equal(calls.length,0);
});
test('pricing admin sends authenticated actor, version and exact integer money to the database',async()=>{
  const {route,calls}=admin();
  assert.equal((await route.POST(request({kind:'product',id:'bundle:myr',version:3,values:{regular_amount_minor:2490}}))).status,200);
  assert.equal((calls[0] as any).args.p_actor,'admin-session:12345');assert.equal((calls[0] as any).args.p_values.regular_amount_minor,2490);
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
