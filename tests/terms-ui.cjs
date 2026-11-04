const fs=require('fs'), path=require('path'), http=require('http'), assert=require('assert/strict');
const root=process.cwd(), esbuild=require(root+'/node_modules/esbuild'), {chromium}=require(root+'/node_modules/@playwright/test');
(async()=>{
const {execFileSync}=require('child_process'),norm=s=>s.replace(/\r\n/g,'\n').trimEnd();
assert.equal(norm(fs.readFileSync('app/terms/page.tsx','utf8')),norm(execFileSync('git',['show','ba1c58c:app/terms/page.tsx'],{encoding:'utf8'})));
assert.equal(norm(fs.readFileSync('lib/terms.ts','utf8')),norm(execFileSync('git',['show','ba1c58c:lib/terms.ts'],{encoding:'utf8'})));
assert.equal(fs.readFileSync('lib/consent.ts','utf8').trim(),"export { CURRENT_TERMS_VERSION } from './terms';");
console.log('PASS original policy content and client-safe version exports');

const bundle=await esbuild.build({stdin:{contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import {BuyButton} from './components/BuyButton'; createRoot(document.getElementById('root')).render(<BuyButton plan='bundle'>Buy</BuyButton>);",resolveDir:root,loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic',plugins:[{name:'fixtures',setup(b){
b.onLoad({filter:/BuyButton\.tsx$/},a=>process.env.BOUNCY_BASELINE?({contents:fs.readFileSync(path.join(__dirname,'components/BuyButton.tsx'),'utf8'),loader:'tsx',resolveDir:path.join(root,'components')}):undefined); b.onResolve({filter:/LocaleProvider$/},()=>({path:'locale',namespace:'fixture'}));
b.onResolve({filter:/SiteConfigProvider$/},()=>({path:'config',namespace:'fixture'}));
b.onResolve({filter:/^@\/lib\/site-config$/},()=>({path:'site',namespace:'fixture'}));
b.onResolve({filter:/^@\/lib\/plans$/},()=>({path:'plans',namespace:'fixture'}));
b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:({
locale:"export const useLocale=()=>({t:(zh,en)=>en});",
config:"export const useSiteConfig=()=>({config:{},preview:false,providers:['stripe','toyyibpay']});",
site:"export const purchaseAllowed=()=>true; export const packagePrice=()=>10;",
plans:"export const price=()=>'$10';"
})[a.path],loader:'js'}));
}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
const server=http.createServer((q,r)=>{r.end('<html><head><style>'+css+'</style></head><body><div id="root"></div><script>'+js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}); const base='http://127.0.0.1:'+server.address().port;
for(const [method,host] of [['stripe','checkout.stripe.com'],['toyyibpay','toyyibpay.com']]){
const page=await browser.newPage({viewport:{width:method==='stripe'?1440:375,height:900}}); await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)&&!u.includes('/api/'))return route.continue();if(u===base+'/api/checkout/'+method){assert.deepEqual(route.request().postDataJSON(),{buyer_email:'buyer@example.com',plan:'bundle',terms_accepted:true,terms_version:'2026-10-06'});return route.fulfill({json:{url:'https://'+host+'/mock-checkout'}});}if(u==='https://'+host+'/mock-checkout')return route.fulfill({body:'Mock checkout'});return route.abort();});
await page.goto(base);await page.getByRole('button',{name:'Buy',exact:false}).click(); assert.equal(await page.locator('[style*="--uib-size"]').count(),0);if(method==='toyyibpay')await page.getByRole('radio',{name:/Powered by ToyyibPay/}).check();
await page.getByLabel('Delivery email',{exact:true}).fill('buyer@example.com');
const checkbox=page.getByRole('checkbox',{name:'I agree to the Terms of Service & Refund Policy'});assert.equal(await checkbox.count(),1,'consent checkbox exists');assert.equal(await checkbox.isChecked(),false);assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
await page.locator('form').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Please agree/);
const link=page.getByRole('link',{name:'Terms of Service & Refund Policy'});assert.equal(await link.getAttribute('href'),'/terms');
const popupPromise=page.waitForEvent('popup');await link.click();const popup=await popupPromise;await popup.close();assert.equal(await checkbox.isChecked(),false);
const row=page.locator('.checkbox-consent');const layout=await row.evaluate(e=>{const c=getComputedStyle(e),a=e.children[0].getBoundingClientRect(),b=e.children[1].getBoundingClientRect();return {display:c.display,align:c.alignItems,gap:c.gap,left:a.left<b.left,overflow:e.scrollWidth>e.clientWidth}});assert.deepEqual(layout,{display:'flex',align:'center',gap:'8px',left:true,overflow:false});
await checkbox.focus();await page.keyboard.press('Space');assert.equal(await checkbox.isChecked(),true);await checkbox.uncheck();assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
await checkbox.hover();await page.mouse.down();await page.locator('.MuiTouchRipple-root .MuiTouchRipple-ripple').first().waitFor();await page.mouse.up();assert.equal(await checkbox.isChecked(),true);
console.log('PASS '+method+': layout, initial state, keyboard, Ripple, policy link, consent gating');
await page.getByRole('button',{name:'Continue to '+(method==='stripe'?'Stripe':'ToyyibPay')}).click();
await page.getByRole('status').waitFor(); const b=page.locator('[style*="--uib-size"]');await b.waitFor({timeout:2000});assert.equal(await b.count(),1);assert.equal(await b.locator('..').getAttribute('aria-hidden'),'true');assert.match(await page.locator('[aria-live="polite"]').innerText(),/Redirecting in/);
await page.waitForURL('https://'+host+'/mock-checkout',{timeout:6000});console.log('PASS '+method+': redirect-only Bouncy, status, countdown, mocked navigation');await page.close();
}
const page=await browser.newPage();await page.route('**/*',r=>r.request().url().includes('/api/')?r.fulfill({status:409,json:{error:'CHECKOUT_UNAVAILABLE'}}):r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);await page.getByRole('button',{name:'Buy',exact:false}).click();await page.getByLabel('Delivery email',{exact:true}).fill('buyer@example.com');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Continue to Stripe'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('[style*="--uib-size"]').count(),0);assert.equal(await page.getByRole('button',{name:'Continue to Stripe'}).isEnabled(),true);console.log('PASS error recovery: no Bouncy, retry enabled');await page.close();
}finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
