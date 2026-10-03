import {test,expect} from '@playwright/test';

for(const device of ['hardware','touch'] as const)test(`static effects on ${device} preserve content, navigation and purchase controls`,async({page})=>{
  await page.addInitScript(device=>{
    if(device==='hardware'){
      Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});
      Object.defineProperty(navigator,'deviceMemory',{get:()=>4});
    }else Object.defineProperty(navigator,'maxTouchPoints',{get:()=>1});
  },device);
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-perf','low');
  await expect(page.locator('html')).toHaveAttribute('data-perf-reason',device);
  await expect(page.locator('.site-header')).toHaveCSS('backdrop-filter','none');
  await expect(page.locator('.electric-logo canvas')).toHaveCount(0);
  await expect(page.locator('.orb-static')).toBeVisible();
  expect(await page.locator('.orb-animated').getAttribute('src')).toBeNull();
  await expect(page.getByRole('heading',{name:/一次配置/,level:1})).toBeVisible();
  await page.getByRole('button',{name:'Switch to English'}).click();
  const hero=page.locator('.hero-checkout');
  await hero.getByRole('radio',{name:/Mobile notifications/}).click();
  await hero.getByRole('tab',{name:'Yearly'}).focus();await page.keyboard.press('ArrowRight');
  await expect(hero.getByRole('tab',{name:'Semester'})).toHaveAttribute('aria-selected','true');
  await expect(hero.getByRole('tab')).toHaveCount(2);await expect(hero).not.toContainText('Degree Pass');await expect(hero).not.toContainText('RM 49.99');
  await page.locator('#showcase').scrollIntoViewIfNeeded();await page.locator('.showcase-main .magic-bento-card').hover();
  await expect(page.locator('.bento-particle,.bento-ripple')).toHaveCount(0);
  await page.getByRole('link',{name:'Contact support',exact:true}).click();await expect(page).toHaveURL(/\/support$/);
});

test('sustained slow frames trigger runtime low mode without changing content',async({page})=>{
  await page.addInitScript(()=>{
    const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
    let id=0;const pending=new Map<number,{timer:number;native?:number}>();
    window.requestAnimationFrame=callback=>{
      const key=++id,job={timer:0,native:undefined as number|undefined};
      job.timer=window.setTimeout(()=>{job.native=raf(time=>{pending.delete(key);callback(time);});},28);
      pending.set(key,job);return key;
    };
    window.cancelAnimationFrame=key=>{const job=pending.get(key);if(job){clearTimeout(job.timer);if(job.native!==undefined)cancel(job.native);pending.delete(key);}};
  });
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-perf-reason','runtime');
  await expect(page.locator('.site-header')).toHaveCSS('backdrop-filter','none');
  await expect(page.locator('.electric-logo canvas')).toHaveCount(0);
  await expect(page.locator('.orb-static')).toBeVisible();
  await expect(page.getByRole('heading',{name:/一次配置/,level:1})).toBeVisible();
});

test('normal blur, media suspension and live preference recovery',async({page})=>{
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-perf','normal');
  await expect(page.locator('.site-header')).toHaveCSS('backdrop-filter','blur(16px)');
  const video=page.locator('.orb-animated');
  await expect.poll(()=>video.evaluate(el=>(el as HTMLVideoElement).paused)).toBe(false);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>video.evaluate(el=>(el as HTMLVideoElement).paused)).toBe(true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>video.evaluate(el=>(el as HTMLVideoElement).paused)).toBe(false);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('html')).toHaveAttribute('data-perf','low');
  await expect(page.locator('.site-header')).toHaveCSS('backdrop-filter','none');
  await expect.poll(()=>video.evaluate(el=>(el as HTMLVideoElement).paused)).toBe(true);
  await page.emulateMedia({reducedMotion:'no-preference'});await expect(page.locator('html')).toHaveAttribute('data-perf','normal');
  await expect.poll(()=>video.evaluate(el=>(el as HTMLVideoElement).paused)).toBe(false);
});

test('bounded effects reuse nodes and avoid pointer-driven layout measurements',async({page})=>{
  await page.goto('/');await page.locator('#showcase').scrollIntoViewIfNeeded();
  const card=page.locator('.showcase-main .magic-bento-card');await card.hover({position:{x:90,y:90}});
  await expect(card.locator('.bento-particle')).toHaveCount(12);
  await card.evaluate(el=>{(window as unknown as {originalParticles:Element[]}).originalParticles=[...el.querySelectorAll('.bento-particle')];});
  await page.mouse.move(5,100);await expect(card.locator('.bento-particle')).toHaveCount(0);
  await card.hover({position:{x:90,y:90}});await expect(card.locator('.bento-particle')).toHaveCount(12);
  expect(await card.evaluate(el=>[...el.querySelectorAll('.bento-particle')].every(node=>(window as unknown as {originalParticles:Element[]}).originalParticles.includes(node)))).toBe(true);
  await card.click({position:{x:90,y:90},clickCount:5,delay:20});
  expect(await card.locator('.bento-ripple').count()).toBeLessThanOrEqual(2);
  await page.waitForTimeout(800);
  await page.evaluate(()=>{
    const original=Element.prototype.getBoundingClientRect;
    const probe=window as unknown as {layoutReads:number};probe.layoutReads=0;
    Element.prototype.getBoundingClientRect=function(){if(this.closest('.magic-bento-grid'))probe.layoutReads++;return original.call(this);};
  });
  const rect=await card.boundingBox();expect(rect).not.toBeNull();
  await page.evaluate(()=>{(window as unknown as {layoutReads:number}).layoutReads=0;});
  for(let i=0;i<12;i++)await page.mouse.move(rect!.x+100+i*5,rect!.y+100+i*2);
  expect(await page.evaluate(()=>(window as unknown as {layoutReads:number}).layoutReads)).toBe(0);
});

test('production retains the local commerce API lock',async({request,baseURL})=>{
  test.skip(process.env.NODE_ENV!=='production'&&!baseURL?.endsWith(':3002'),'Production-only security boundary');
  const result=await request.post('/api/checkout',{headers:{Origin:baseURL!},data:{plan:'extension',locale:'en'}});
  expect(result.status()).toBe(403);expect((await result.json()).error).toBe('LOCAL_ONLY');
});
