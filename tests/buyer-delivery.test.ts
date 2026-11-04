import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadServerModule} from './helpers/server-module';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const id='11111111-1111-4111-8111-111111111111', receipt='b'.repeat(64), session='c'.repeat(64), csrf='d'.repeat(64);
const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
function fixture() {
  const calls:any[]=[];
  const globals={process:{env:{NODE_ENV:'production',APP_URL:'https://shop.example',SUPABASE_SERVICE_ROLE_KEY:'fixture-proxy'}},URL,Request,Response,Headers};
  const canonical={privateHeaders,orderCookie:(order:string,token:string)=>`ac-order-${order}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`,pricingDatabase:()=>{throw Error('Website must not read/decrypt buyer licenses');},
    canonicalCall:async(action:string,body:unknown,authorization:string,headers:Record<string,string>)=>{calls.push({action,body,authorization,headers});return Response.json(action==='buyer-session'?{sessionToken:session,csrfToken:csrf}:action==='commerce-recovery-start'?{ok:true,challengeId:id,recoveryToken:session}:action==='commerce-recovery-complete'?{ok:true,receiptToken:receipt}:action==='reveal-license'?{licenseKey:'AC-LIC-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH'}:{order:{id,status:'paid'},hasLicense:true,downloadAvailable:true});}};
  const helper=loadServerModule<any>('lib/order-delivery.ts',{'./canonical-commerce':canonical},globals);
  const route=loadServerModule<any>('app/api/commerce/route.ts',{'@/lib/order-delivery':helper,'@/lib/canonical-commerce':canonical,'@/lib/stripe-server':{readStripeBody:async(r:Request)=>Buffer.from(await r.text())}},globals);
  const request=(action:string,headers:Record<string,string>={})=>new Request('https://shop.example/api/commerce',{method:'POST',headers:{Origin:'https://shop.example','Content-Type':'application/json','x-nf-client-connection-ip':'192.0.2.1',Cookie:`ac-order-${id}=${receipt}; ac-buyer-${id}=${session}`,...headers},body:JSON.stringify({action,orderId:id})});
  return {helper,route,request,calls,canonical,globals};
}
test('buyer bootstrap stores its session in HttpOnly Secure SameSite cookie and exposes only CSRF',async()=>{
  const f=fixture(),r=await f.route.POST(f.request('buyer-session'));
  assert.equal(r.status,200);const body=await r.json();assert.equal(body.csrfToken,csrf);assert.equal(JSON.stringify(body).includes(session),false);
  assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
});
test('cookie proof and session CSRF are forwarded to canonical Edge, not replaced by service role ownership',async()=>{
  const f=fixture(),r=await f.route.POST(f.request('reveal-license',{'X-Commerce-CSRF':csrf}));assert.equal(r.status,200);
  assert.equal(f.calls[0].headers['X-Order-Receipt'],receipt);assert.equal(f.calls[0].headers['X-Buyer-Session'],session);assert.equal(f.calls[0].headers['X-Commerce-CSRF'],csrf);
  assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});
test('cross-Origin, missing CSRF and GET reveal are rejected before canonical call',async()=>{
  const f=fixture();assert.equal((await f.route.POST(f.request('reveal-license',{Origin:'https://evil.example','X-Commerce-CSRF':csrf}))).status,403);
  assert.equal((await f.route.POST(f.request('reveal-license'))).status,403);assert.equal(f.calls.length,0);
  assert.equal(typeof f.route.GET,'function');assert.equal((await f.route.GET()).status,405);
});
test('recovery proof/receipt rotation are HttpOnly cookies, never JSON credentials',async()=>{
  const f=fixture(),headers={'X-Commerce-CSRF':csrf};
  const start=await f.route.POST(f.request('recovery-start',headers));assert.equal(start.status,200);assert.equal(JSON.stringify(await start.json()).includes(session),false);assert.match(start.headers.get('set-cookie'),/ac-recovery/);
  const done=await f.route.POST(f.request('recovery-complete',headers));assert.equal(done.status,200);assert.equal(JSON.stringify(await done.json()).includes(receipt),false);assert.match(done.headers.get('set-cookie'),/HttpOnly/);
});
test('production receipt cookies stay Secure even if an upstream request URL is HTTP',()=>{
  const f=fixture();const mod=loadServerModule<any>('lib/canonical-commerce.ts',{'./stripe-server':{},'@supabase/supabase-js':{}},f.globals);
  assert.match(mod.orderCookie(id,receipt,new Request('http://shop.example')),/; Secure/);
});
test('ZIP route is POST-only and delegates entitlement decisions to canonical Edge',async()=>{
  const f=fixture(),mod=loadServerModule<any>('app/api/site/download/[token]/route.ts',{'@/lib/order-delivery':{deliveryAction:async()=>Response.json({signedUrl:'https://private.example/signed'})},'@/lib/canonical-commerce':f.canonical,'@/lib/security':{localOnly:()=>{throw Error('disabled');}},'@/lib/site-settings':{},'@/lib/site-assets':{}},f.globals);
  assert.equal((await mod.GET()).status,405);assert.equal((await mod.POST(f.request('private-download',{'X-Commerce-CSRF':csrf}),{params:Promise.resolve({token:id})})).status,200);
});

test('production operator provisioning stays disabled before MFA/fresh-auth/audit acceptance',async()=>{
  let inserted=false;
  const mod=loadServerModule<any>('app/admin/actions.ts',{'next/navigation':{},'next/cache':{revalidatePath:()=>{}},'@/lib/admin-auth':{requireAdminSession:async()=>{}},'@/lib/admin-keys':{generateActivationCode:()=> 'AC-LIC-FAKE-TEST-ONLY-AAAA',hashActivationCode:()=> 'a'.repeat(64)},'@/lib/admin-key-options':{isKeyPlan:()=>true},'@/lib/canonical-commerce':{pricingDatabase:()=>({from:()=>({insert:async()=>{inserted=true;return {error:null};}})})}},{process:{env:{NODE_ENV:'production'}}});
  assert.equal(Array.isArray(await mod.generateKeysAction('extension',1)),false);assert.equal(inserted,false);
});

test('buyer page reveals only on click, clears on navigation and reads no persistent device token',async()=>{
  const marker='AC-LIC-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH';
  const compiled=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Purchase from './app/purchase/page';createRoot(document.getElementById('root')).render(React.createElement(Purchase));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
  const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'application/javascript':'text/html');res.end(req.url==='/bundle.js'?compiled.outputFiles[0].text:'<div id="root"></div><script src="/bundle.js"></script>');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();const actions:string[]=[];
    await page.addInitScript(()=>sessionStorage.setItem('auto-check-device-token','must-not-forward-fixture'));
    await page.route('**/api/commerce',async route=>{
      const request=route.request(),body=request.postDataJSON();actions.push(body.action);assert.equal(request.headers().authorization,undefined);
      const payload=body.action==='buyer-session'?{csrfToken:csrf}:body.action==='reveal-license'?{licenseKey:marker}:{order:{id,status:'paid',fulfillment_status:'fulfilled',currency:'myr',amount_minor:1999,phone_duration_days:0},hasLicense:true,downloadAvailable:true,needsClaim:false};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
    });
    await page.goto(`http://127.0.0.1:${address.port}/purchase?order_id=${id}`);
    const button=page.getByRole('button',{name:'显示许可证'});await button.waitFor({timeout:5000});
    assert.equal(actions.includes('reveal-license'),false);assert.equal((await page.content()).includes(marker),false);
    await button.click();await page.getByText(marker,{exact:true}).waitFor();
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(value=>!document.body.textContent?.includes(value),marker);
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
