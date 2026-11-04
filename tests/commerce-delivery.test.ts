import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadServerModule} from './helpers/server-module';
const {generateActivationCode,hashActivationCode}=loadServerModule<typeof import('../lib/admin-keys')>('lib/admin-keys.ts',{});
const id='11111111-1111-4111-8111-111111111111';
const readStripeBody=async(r:Request,max:number)=>{const b=Buffer.from(await r.text());if(b.length>max)throw Error('BODY_TOO_LARGE');return b;};
const request=()=>new Request('https://shop.example/api/checkout/stripe',{method:'POST',headers:{Origin:'https://shop.example','Content-Type':'application/json'},body:JSON.stringify({plan:'extension',buyer_email:'buyer@example.test'})});
test('public sales stay disabled and production cannot enable local commerce test mode',async()=>{
  for(const env of [{},{NODE_ENV:'production',COMMERCE_TEST_MODE:'true'}]){
    let called=false;
    const mod=loadServerModule<typeof import('../lib/canonical-commerce')>('lib/canonical-commerce.ts',{'./stripe-server':{readStripeBody},'@supabase/supabase-js':{}},{process:{env},Response,Request,AbortSignal,fetch:async()=>{called=true;throw Error('must not call');}});
    const r=await mod.canonicalCheckout(request(),'stripe');assert.equal(r.status,503);assert.equal((await r.json()).error,'sales_disabled');assert.equal(called,false);
  }
});
test('legacy webhook entry point forwards untouched bytes and provider signature to canonical verifier',async()=>{
  let body='',signature='',url='';
  const mod=loadServerModule<typeof import('../lib/canonical-commerce')>('lib/canonical-commerce.ts',{'./stripe-server':{readStripeBody},'@supabase/supabase-js':{}},{process:{env:{}},Response,Request,Headers,AbortSignal,fetch:async(u:string,init:RequestInit)=>{url=u;body=Buffer.from(init.body as Uint8Array).toString();signature=(init.headers as Headers).get('stripe-signature')!;return Response.json({received:true});}});
  const raw='{ "a" : 1 }';const r=await mod.canonicalWebhook(new Request('https://shop.example/hook',{method:'POST',headers:{'stripe-signature':'exact-signature','Content-Type':'application/json'},body:raw}),'stripe');
  assert.equal(r.status,200);assert.equal(body,raw);assert.equal(signature,'exact-signature');assert.equal(url,'https://qckpwckfukyurkobrsig.supabase.co/functions/v1/payment-webhook?provider=stripe');
});
test('order UUID without a cookie or authenticated device never reads private order data',async()=>{
  let called=false;
  const mod=loadServerModule<typeof import('../lib/order-delivery')>('lib/order-delivery.ts',{'./canonical-commerce':{pricingDatabase:()=>({from(){called=true;throw Error('must not read');}})}});
  assert.equal(await mod.ownedOrder(new Request('https://shop.example/api/commerce'),id),null);assert.equal(called,false);
});
test('administrator-generated keys use the canonical AC-LIC activation format',()=>{
  const keys=Array.from({length:100},generateActivationCode);assert.equal(new Set(keys).size,100);
  for(const key of keys){assert.match(key,/^AC-LIC(?:-[A-Z0-9]{4}){4}$/);assert.match(hashActivationCode(key),/^[a-f0-9]{64}$/);assert.equal(hashActivationCode(key),hashActivationCode(' '+key.toLowerCase()+' '));}
});
test('production builds never open the local demonstration database',()=>{
  let opened='';
  loadServerModule('lib/store.ts',{'./plans':{},'./site-config':{},'node:fs':{mkdirSync:()=>{throw Error('must not create directories');}},'node:sqlite':{DatabaseSync:class {constructor(path:string){opened=path;}exec(){}}}},{process:{env:{NODE_ENV:'production',LOCAL_DB_PATH:'must-not-open.sqlite'}}});
  assert.equal(opened,':memory:');
});
