const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const phase=process.argv[2]||'before';
const out='.local/checkout-audit';fs.mkdirSync(out,{recursive:true});
const catalog={server_now:new Date().toISOString(),campaign:{id:'audit',name:'audit',enabled:false,starts_at:null,ends_at:null,version:1,state:'inactive'},checkout_allowed:true,providers:['stripe','toyyibpay'],products:['extension','phone','yearly','bundle'].map((key,i)=>({id:key,product_key:key,currency:'myr',regular_amount_minor:[2499,1199,2199,3698][i],promotional_amount_minor:null,effective_amount_minor:[2499,1199,2199,3698][i],enabled:true,promotion_enabled:false,promotion_active:false,version:1,campaign_starts_at:null,campaign_ends_at:null}))};
async function probe(){
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[];
 for(const width of phase==='before'?[390]:[360,390,430,1440]){
 const context=await b.newContext({viewport:{width,height:844},isMobile:width<768,hasTouch:width<768});
 await context.route('**/api/pricing',r=>r.fulfill({json:catalog}));
 await context.addInitScript(()=>{
 localStorage.setItem('vf-locale','en');window.audit={frames:[],shifts:[],active:false};
 new PerformanceObserver(list=>{for(const e of list.getEntries())window.audit.shifts.push({value:e.value,recent:e.hadRecentInput,path:location.pathname,active:window.audit.active,sources:e.sources.map(s=>({node:s.node?.className,previous:s.previousRect,current:s.currentRect}))})}).observe({type:'layout-shift',buffered:true});
 const tick=()=>{if(window.audit.active){const main=document.querySelector('#main');const pay=document.querySelector('button[type=submit]');const actions=pay?.parentElement;const rect=actions?.getBoundingClientRect();const wrapper=document.querySelector('[data-page-transition]');window.audit.frames.push({t:performance.now(),path:location.pathname,main:main?+getComputedStyle(main).opacity:null,wrapper:wrapper?+getComputedStyle(wrapper).opacity:1,bottom:rect?.bottom,top:rect?.top,height:innerHeight,width:innerWidth,position:actions?getComputedStyle(actions).position:null,ancestors:pay?(()=>{let e=pay.parentElement,a=[];while(e){if(getComputedStyle(e).transform!=='none')a.push(e.tagName+':'+getComputedStyle(e).transform);e=e.parentElement}return a})():[]})}requestAnimationFrame(tick)};requestAnimationFrame(tick);
 });
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const reset=()=>p.evaluate(()=>{window.audit.frames=[];window.audit.shifts=[];window.audit.active=true});
 const report=async(name)=>{const d=await p.evaluate(()=>{window.audit.active=false;return window.audit});fs.writeFileSync(`${out}/${phase}-${width}-${name}.json`,JSON.stringify(d));const frames=d.frames;const pay=frames.filter(f=>f.bottom!==undefined&&f.width<=900);const r={width,name,frames:frames.length,black:frames.filter(f=>f.main<.05||f.wrapper<.05).length,misplaced:pay.filter(f=>Math.abs(f.bottom-f.height)>2).length,transformed:frames.filter(f=>f.ancestors.length).length,cls:d.shifts.filter(s=>!s.recent).reduce((n,s)=>n+s.value,0)};results.push(r);console.log(JSON.stringify(r));};
 await p.goto('http://127.0.0.1:3002/');const purchase=p.locator(width<768?'.mobile-inline-cta button':'.hero-checkout .buy-action button').first();await purchase.waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('.buy-action button')].some(b=>!b.disabled));await p.waitForTimeout(800);
 // Hold the real route response to make the pre-navigation gap measurable.
 let release;const gate=new Promise(r=>release=r);await p.route('**/checkout?*',async r=>{if(r.request().resourceType()==='fetch')await gate;await r.continue()});
 await reset();await purchase.click();await p.waitForTimeout(350);await p.screenshot({path:`${out}/${phase}-${width}-pending.png`});release();await p.waitForURL('**/checkout?plan=bundle');await p.locator('button[type=submit]').waitFor();await p.screenshot({path:`${out}/${phase}-${width}-entry.png`});await p.waitForTimeout(700);await report('navigation');await p.unroute('**/checkout?*');
 await reset();await p.getByRole('button',{name:'Back',exact:true}).click();await p.waitForURL('http://127.0.0.1:3002/');await p.waitForTimeout(500);await report('back');
 if(phase!=='before'){
 for(let i=0;i<2;i++){await reset();await purchase.click();await p.waitForURL('**/checkout?plan=bundle');await p.waitForTimeout(500);await p.goBack();await p.waitForTimeout(500);await p.goForward();await p.waitForTimeout(500);await report('repeat-'+i);await p.goBack();}
 await reset();await p.goto('http://127.0.0.1:3002/checkout?plan=bundle');await p.evaluate(()=>window.audit.active=true);await p.waitForTimeout(800);await report('direct');
 if(width<768){await reset();await p.setViewportSize({width,height:480});await p.waitForTimeout(250);await p.getByRole('textbox',{name:'Email',exact:true}).focus();await p.waitForTimeout(250);await p.setViewportSize({width,height:844});await p.waitForTimeout(250);await report('resize');}
 await p.emulateMedia({reducedMotion:'reduce'});await reset();await p.goto('http://127.0.0.1:3002/checkout?plan=bundle');await p.evaluate(()=>window.audit.active=true);await p.waitForTimeout(500);await report('reduced');
 const cdp=await context.newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:200,downloadThroughput:150000,uploadThroughput:75000});await p.goto('http://127.0.0.1:3002/');await purchase.waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('.buy-action button')].some(b=>!b.disabled));await reset();await purchase.click();await p.waitForURL('**/checkout?plan=bundle');await p.waitForTimeout(800);await report('slow');
 }
 console.log('errors',width,JSON.stringify(errors));await context.close();
 }
 fs.writeFileSync(`${out}/${phase}-summary.json`,JSON.stringify(results,null,2));await b.close();if(results.some(r=>r.black||r.misplaced||r.transformed))process.exitCode=1;
}
probe().catch(e=>{console.error(e);process.exit(2)});
