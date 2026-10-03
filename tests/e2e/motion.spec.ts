import {test,expect} from '@playwright/test';

test('headline masks, native wheel input, feature reveals, and anchor navigation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await expect(page.locator('.hero-line-mask')).toHaveCount(2);
  await expect(page.locator('.hero-line-mask').first()).toHaveCSS('overflow','hidden');
  await expect(page.locator('.hero-line').first()).toHaveCSS('opacity','1');
  await expect(page.locator('.hero-line').last()).toHaveCSS('transform','none');
  await page.screenshot({path:'.local/motion-live-desktop.png'});
  await expect(page.locator('.feature').first()).toHaveCSS('opacity','0');
  await page.mouse.move(500,500);await page.mouse.wheel(0,500);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(300);
  await page.locator('#product').scrollIntoViewIfNeeded();
  for(const card of await page.locator('.feature').all()) await expect(card).toHaveCSS('opacity','1');
  await page.getByRole('link',{name:'立即购买',exact:false}).first().click();
  await expect(page).toHaveURL(/#pricing/);
  await expect.poll(()=>page.locator('#pricing').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBeGreaterThan(80);
  await expect.poll(()=>page.locator('#pricing').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBeLessThan(160);
  await page.getByRole('button',{name:'Chrome 插件安装 · Windows',exact:false}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/lenis-stopped/);
  const background=await page.evaluate(()=>scrollY);
  await page.mouse.move(20,500);await page.mouse.wheel(0,500);
  await page.waitForTimeout(550);
  expect(await page.evaluate(()=>scrollY)).toBe(background);
  await dialog.hover();await page.mouse.wheel(0,500);
  await expect.poll(()=>dialog.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Switch to English'}).click();
  await expect(page.getByRole('heading',{name:/Set it up\.\s*Stay on track\./})).toBeVisible();
  await page.getByRole('link',{name:'Support',exact:true}).first().click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await page.getByRole('link',{name:'Soton Auto-Check home'}).click();
  await expect(page.locator('html')).toHaveClass(/lenis/);
  expect(errors).toEqual([]);
});

test('feature reveals follow the mobile grid after resizing from desktop',async({page})=>{
  await page.goto('/');await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const grid=document.querySelector('.product-bento-grid')!;
    window.scrollTo({top:grid.getBoundingClientRect().top+scrollY-innerHeight*0.78,behavior:'instant'});
  });
  await expect(page.locator('.feature').nth(0)).toHaveCSS('opacity','1');
  await expect(page.locator('.feature').nth(1)).toHaveCSS('opacity','0');
  await expect(page.locator('.feature').nth(2)).toHaveCSS('opacity','0');
  await expect(page.locator('.feature').nth(3)).toHaveCSS('opacity','0');
  await page.locator('.feature').nth(1).evaluate(el=>{
    window.scrollTo({top:el.getBoundingClientRect().top+scrollY-innerHeight*0.78,behavior:'instant'});
  });
  await expect(page.locator('.feature').nth(1)).toHaveCSS('opacity','1');
  await expect(page.locator('.feature').nth(2)).toHaveCSS('opacity','0');
  const top=await page.locator('.feature').nth(1).evaluate(el=>el.getBoundingClientRect().top);
  expect(await page.locator('.feature').nth(2).evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThan(top+100);
});

test('reduced motion leaves native input and all content visible, including live preference changes',async({page})=>{
  const hydrationErrors:string[]=[];
  page.on('console',message=>{if(message.type()==='error'&&/hydrated|hydration mismatch/i.test(message.text()))hydrationErrors.push(message.text());});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  for(const element of await page.locator('.hero-line,.step,.feature').all()) await expect(element).toHaveCSS('opacity','1');
  await page.getByRole('button',{name:'Chrome 插件安装 · Windows',exact:false}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const background=await page.evaluate(()=>scrollY);
  await page.mouse.move(20,500);await page.mouse.wheel(0,500);
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>scrollY)).toBe(background);
  await dialog.hover();await page.mouse.wheel(0,500);
  await expect.poll(()=>dialog.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  for(const element of await page.locator('.hero-line,.step,.feature').all()) await expect(element).toHaveCSS('opacity','1');
  expect(hydrationErrors).toEqual([]);
});

test('standalone CDN example runs, freezes animation frames, and supports reduced motion',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const [label,time] of [['start',0],['mid',1.95],['end',3.9]] as const){
    await page.goto(`/animation-demo.html?t=${time}`);
    await page.waitForFunction(()=>Boolean((window as unknown as {__ready:boolean}).__ready));
    await expect(page.locator('html')).not.toHaveClass(/lenis/);
    await page.screenshot({path:`.local/motion-${label}.png`,fullPage:true});
    if(label==='start')await expect(page.locator('.headline-line').first()).toHaveCSS('opacity','0');
    if(label==='end'){
      await expect(page.locator('.headline-line').last()).toHaveCSS('opacity','1');
      await expect(page.locator('.feature-card').last()).toHaveCSS('opacity','1');
    }
  }
  await page.goto('/animation-demo.html');
  await page.waitForFunction(()=>Boolean((window as unknown as {__ready:boolean}).__ready));
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.getByRole('link',{name:'Explore the features'}).click();
  await expect(page).toHaveURL(/#features/);
  await expect(page.locator('.feature-card').last()).toHaveCSS('opacity','1');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await expect(page.locator('.headline-line').first()).toHaveCSS('opacity','1');
  await expect(page.locator('#showcase')).toHaveCSS('opacity','1');
  expect(errors).toEqual([]);
});
