import test from 'node:test';
import assert from 'node:assert/strict';
import {loadServerModule} from './helpers/server-module';
import {DEFAULT_SITE_CONFIG,packagePrice,purchaseAllowed} from '../lib/site-config';

function fixture(){
  const written:any[]=[],sessions:any[]=[];
  const config=structuredClone(DEFAULT_SITE_CONFIG);config.settings.checkoutEnabled=true;config.settings.extensionRelease={assetId:'11111111-1111-4111-8111-111111111111',label:'latest'};
  const db:any={rpc:async()=>({data:{licensed:true},error:null}),from:()=>({insert:(row:any)=>{written.push(row);return Promise.resolve({error:null});},update:()=>({eq:()=>Promise.resolve({error:null})})})};
  const api=loadServerModule<any>('lib/unified-commerce.ts',{
    '@/lib/site-settings':{getPublishedSiteConfig:async()=>config},
    '@/lib/site-config':{packagePrice,purchaseAllowed},
    '@/lib/supabase/commerce':{getCommerceDatabase:()=>db},
    '@/lib/stripe-server':{readStripeBody:async(request:Request)=>Buffer.from(await request.text()),getStripe:()=>({checkout:{sessions:{create:async(input:any)=>{sessions.push(input);return {id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture'};}}}})},
    '@/lib/license-key-encryption':{encryptLicenseKey:()=> 'v1.synthetic.authenticated.ciphertext'},
    '@/lib/plugin-license-key':{generatePluginLicenseKey:()=> 'AC-LIC-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA'},
  },{process:{env:{NODE_ENV:'production',APP_URL:'https://auto-check.example',TOYYIBPAY_SECRET_KEY:'synthetic-test-secret',TOYYIBPAY_CATEGORY_CODE:'synthetic-category'}},fetch:async()=>new Response('[{"BillCode":"fixture-bill"}]',{status:200})});
  return {api,written,sessions};
}
const request=(body:any,origin='https://auto-check.example')=>new Request('https://auto-check.example/api/checkout/stripe',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
test('public phone purchase requires authenticated extension',async()=>{
  const {api,written}=fixture();const r=await api.createUnifiedCheckout(request({plan:'semester',buyer_email:'a@example.invalid',terms_accepted:true}),'stripe');
  assert.equal(r.status,403);assert.equal(written.length,0);
});
for(const provider of ['stripe','toyyibpay'])for(const [plan,price] of [['extension',2499],['semester',1199],['yearly',1999],['bundle',3500]] as const){
  test(`${provider} ${plan} creates the selected order at the published price`,async()=>{
    const {api,written}=fixture();
    const r=await api.createUnifiedCheckout(request({plan,buyer_email:'a@example.invalid',terms_accepted:true}),provider,['semester','yearly'].includes(plan)?'11111111-1111-4111-8111-111111111111':null);
    assert.equal(r.status,200);assert.equal(written[0].amount_minor,price);assert.equal(written[0].payment_provider,provider);
    assert.equal(written[0].phone_duration_days,plan==='yearly'?365:plan==='extension'?0:130);
  });
}
test('checkout refuses cross-origin requests',async()=>{
  const {api,written}=fixture();const r=await api.createUnifiedCheckout(request({plan:'extension',buyer_email:'a@example.invalid',terms_accepted:true},'https://other.invalid'),'stripe');
  assert.equal(r.status,403);assert.equal(written.length,0);
});
test('plugin purchase snapshots server price and uses supported Stripe parameters',async()=>{
  const {api,written,sessions}=fixture();const r=await api.createUnifiedCheckout(request({plan:'extension',buyer_email:'a@example.invalid',terms_accepted:true}),'stripe');
  assert.equal(r.status,200);assert.equal(written.length,1);assert.equal(written[0].amount_minor,2499);
  assert.deepEqual(Array.from(sessions[0].allowed_payment_method_types),['card','fpx']);
  assert.equal(sessions[0].success_url.includes('token='),false);
  assert.match(r.headers.get('set-cookie')??'',/HttpOnly/);
});
