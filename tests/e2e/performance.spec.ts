import {test,expect} from '@playwright/test';

test('wheel and trackpad-sized deltas stay native and anchors yield to input',async({page})=>{
  await page.addInitScript(()=>{
    const probe=window as unknown as {wheelPrevented:boolean[]};probe.wheelPrevented=[];
    window.addEventListener('wheel',event=>{queueMicrotask(()=>probe.wheelPrevented.push(event.defaultPrevented));},{passive:true});
  });
  await page.goto('/');await expect(page.locator('.hero-line').last()).toHaveCSS('transform','none');
  await page.mouse.move(450,400);await page.mouse.wheel(0,300);
  await expect.poll(()=>page.evaluate(()=>scrollY),{timeout:500}).toBe(300);
  const start=await page.evaluate(()=>scrollY);
  for(let i=0;i<6;i++)await page.mouse.wheel(0,12);
  await expect.poll(()=>page.evaluate(()=>scrollY),{timeout:500}).toBe(start+72);
  await page.getByRole('link',{name:'立即购买',exact:false}).first().click();
  await expect(page).toHaveURL(/#pricing/);
  await page.mouse.wheel(0,-120);
  await expect(page.locator('html')).not.toHaveClass(/lenis-smooth/);
  const interrupted=await page.evaluate(()=>scrollY);
  await page.waitForTimeout(550);
  expect(await page.evaluate(()=>scrollY)).toBe(interrupted);
  expect(await page.evaluate(()=>(window as unknown as {wheelPrevented:boolean[]}).wheelPrevented)).toEqual(Array(8).fill(false));
  await expect(page.locator('html')).toHaveCSS('scroll-behavior','auto');
  await page.getByRole('link',{name:'立即购买',exact:false}).first().click();
  await expect.poll(()=>page.locator('#pricing').evaluate(el=>el.getBoundingClientRect().top),{timeout:1200}).toBeLessThan(160);
  await expect(page.locator('html')).not.toHaveClass(/lenis-smooth/);
});

test('electric rendering is capped and completely stops while scrolling or offscreen',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const probe=window as unknown as {draws:number};probe.draws=0;
    for(const name of ['drawArrays','drawElements'] as const){
      const original=WebGL2RenderingContext.prototype[name];
      // Preserve the browser's overloads while observing actual GPU submissions.
      (WebGL2RenderingContext.prototype[name] as unknown)=(function(this:WebGL2RenderingContext,...args:unknown[]){
        probe.draws++;return Reflect.apply(original,this,args);
      });
    }
  });
  await page.goto('/');await expect(page.locator('.electric-logo')).toHaveAttribute('data-rendered','true');
  expect(await page.locator('.electric-logo canvas').evaluate(el=>(el as HTMLCanvasElement).width*(el as HTMLCanvasElement).height)).toBeLessThanOrEqual(453000);
  await expect(page.locator('.hero-line').last()).toHaveCSS('will-change','auto');
  const draws=()=>page.evaluate(()=>(window as unknown as {draws:number}).draws);
  const idle=await draws();await page.waitForTimeout(1100);const idleDraws=(await draws())-idle;
  expect(idleDraws).toBeGreaterThan(0);expect(idleDraws).toBeLessThanOrEqual(35);
  await page.mouse.move(400,350);await page.mouse.wheel(0,8);
  const during=await draws();
  for(let i=0;i<6;i++){await page.mouse.wheel(0,8);await page.waitForTimeout(30);}
  expect(await draws()).toBe(during);
  await expect.poll(draws).toBeGreaterThan(during);
  await page.locator('#product').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  const offscreen=await draws();await page.waitForTimeout(300);expect(await draws()).toBe(offscreen);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await expect.poll(draws).toBeGreaterThan(offscreen);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.electric-logo canvas')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'no-preference'});await expect(page.locator('.electric-logo')).toHaveAttribute('data-rendered','true');
  await page.locator('.support-orb').click();await expect(page).toHaveURL(/\/support$/);
  const removed=await draws();await page.waitForTimeout(250);expect(await draws()).toBe(removed);expect(errors).toEqual([]);
});

test('bento effects pause during a gesture, resume on idle, and release layer hints',async({page})=>{
  await page.goto('/');await page.locator('#showcase').scrollIntoViewIfNeeded();
  const card=page.locator('.showcase-main .magic-bento-card');
  await card.hover();await expect(card.locator('.bento-particle')).toHaveCount(12);
  await expect(card).toHaveCSS('will-change','transform, opacity');
  await page.mouse.wheel(0,5);await expect(card.locator('.bento-particle')).toHaveCount(0);
  for(let i=0;i<4;i++){await page.mouse.wheel(0,5);await page.waitForTimeout(30);expect(await card.locator('.bento-particle').count()).toBe(0);}
  await expect(card.locator('.bento-particle')).toHaveCount(12);
  await page.mouse.move(5,100);await expect(card.locator('.bento-particle')).toHaveCount(0);await expect(card).toHaveCSS('will-change','auto');
  await page.locator('#product').scrollIntoViewIfNeeded();
  for(const feature of await page.locator('.feature').all()){await expect(feature).toHaveCSS('opacity','1');await expect(feature).toHaveCSS('will-change','auto');}
  await expect(page.locator('#showcase')).toHaveCSS('will-change','auto');
});

test('anchor clock excludes idle time and refreshes the scroll limit after height changes',async({page})=>{
  await page.goto('/');await expect(page.locator('.hero-line').last()).toHaveCSS('transform','none');
  await page.getByRole('link',{name:'立即购买',exact:false}).first().click();
  await expect(page.locator('html')).not.toHaveClass(/lenis-smooth/);
  await page.evaluate(()=>{
    document.querySelector('footer')!.id='resize-target';
    const anchor=document.createElement('a');anchor.href='#resize-target';anchor.id='resize-probe';anchor.textContent='Resize probe';
    document.querySelector('.nav-actions')!.appendChild(anchor);
  });
  await page.setViewportSize({width:1440,height:600});await page.waitForTimeout(250);
  await page.locator('#resize-probe').click();
  await expect.poll(()=>page.evaluate(()=>Math.abs(scrollY-(document.documentElement.scrollHeight-innerHeight)))).toBeLessThanOrEqual(2);
  await page.waitForTimeout(550);
  await page.keyboard.press('Home');await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await page.locator('#resize-probe').click();await page.keyboard.press('Home');
  await expect(page.locator('html')).not.toHaveClass(/lenis-smooth/);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
});
