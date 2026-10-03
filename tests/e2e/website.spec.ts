import { test,expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createPaidOrder } from './helpers/orders';
mkdirSync('.local',{recursive:true});

test('dark bento showcase, language, guide dialog, and page links',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:/一次配置，\s*告别签到遗漏。/})).toBeVisible();
  await expect(page.locator('input[type=email]')).toHaveCount(0);
  await page.screenshot({path:'.local/preview-desktop.png'});
  await page.locator('#showcase').scrollIntoViewIfNeeded();await expect(page.locator('#showcase')).toHaveCSS('opacity','1');
  await page.locator('#showcase').screenshot({path:'.local/bento-final-desktop.png',style:'header, .support-orb { visibility: hidden; }'});
  await page.locator('#product').scrollIntoViewIfNeeded();
  for(const feature of await page.locator('.feature').all())await expect(feature).toHaveCSS('opacity','1');
  await page.locator('#product').screenshot({path:'.local/bento-final-features.png',style:'header, .support-orb { visibility: hidden; }'});
  await page.getByRole('button',{name:'Switch to English'}).click();
  await expect(page.getByRole('heading',{name:/Set it up\.\s*Stay on track\./})).toBeVisible();
  await page.locator('#showcase').scrollIntoViewIfNeeded();
  await expect(page.locator('#showcase')).toHaveCSS('opacity','1');
  const design=await page.locator('#showcase').evaluate(el=>({margin:getComputedStyle(el).marginTop,width:el.getBoundingClientRect().width,viewport:innerWidth,background:getComputedStyle(el).backgroundColor}));
  expect(parseFloat(design.margin)).toBeGreaterThanOrEqual(80);expect(design.width).toBeLessThan(design.viewport);expect(design.background).not.toBe('rgb(255, 255, 255)');
  await expect(page.locator('#showcase .magic-bento-card')).toHaveCount(6);
  await expect(page.locator('.case-study-card')).toHaveCount(0);
  await expect(page.locator('#showcase .showcase-timetable .magic-bento-card')).toHaveCSS('background-color','rgb(18, 19, 21)');
  await expect(page.locator('#showcase .showcase-timetable .magic-bento-card')).toHaveCSS('border-radius','36px');
  await page.screenshot({path:'.local/preview-showcase.png'});
  await expect(page.getByRole('heading',{name:'Your timetable, connected.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Stay in the loop.'})).toBeVisible();
  await page.getByRole('button',{name:'Chrome extension · Windows'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  for(const image of await page.locator('.guide-image img').all()){await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}
  expect(errors).toEqual([]);
});

test('mobile bento layout keeps complete content without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.screenshot({path:'.local/preview-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#showcase').scrollIntoViewIfNeeded();await expect(page.locator('#showcase')).toHaveCSS('opacity','1');
  await expect(page.locator('#showcase .magic-bento-card')).toHaveCount(6);
  await expect(page.locator('.product-bento-grid .magic-bento-card')).toHaveCount(6);
  await expect(page.locator('.showcase-bento-grid')).not.toHaveAttribute('data-motion','enabled');
  for(const card of await page.locator('.magic-bento-card').all()){
    const bounds=await card.evaluate(el=>{const rect=el.getBoundingClientRect();return {left:rect.left,right:rect.right,viewport:innerWidth,fits:el.scrollHeight<=el.clientHeight+2};});
    expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);expect(bounds.fits).toBe(true);
  }
  await page.locator('#showcase').screenshot({path:'.local/preview-mobile-showcase.png',style:'header, .support-orb { visibility: hidden; }'});
  await page.getByRole('button',{name:'打开导航'}).click();await expect(page.getByRole('link',{name:'使用教程',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'使用教程',exact:true}).click();await expect(page).toHaveURL(/#tutorials/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('bento hover effects are scoped and clean up on live reduced motion and navigation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.locator('#showcase').scrollIntoViewIfNeeded();
  const grid=page.locator('.showcase-bento-grid');const card=grid.locator('.magic-bento-card').first();
  await expect(grid).toHaveAttribute('data-motion','enabled');await expect(page.locator('#showcase')).toHaveCSS('opacity','1');
  await card.hover({position:{x:65,y:70}});
  await expect(card.locator('.bento-particle')).toHaveCount(12);
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Locator click may auto-scroll a tall, tilted card, legitimately suspending
  // its ripple. Click the already-visible point to test idle interaction.
  const clickBounds=await card.boundingBox();expect(clickBounds).not.toBeNull();
  await page.mouse.click(clickBounds!.x+70,clickBounds!.y+75);await expect(card.locator('.bento-ripple')).toHaveCount(1);
  await expect(card.locator('.bento-ripple')).toHaveCount(0);
  await page.mouse.move(5,200);await expect(page.locator('.bento-particle')).toHaveCount(0);
  await card.hover();await expect(card.locator('.bento-particle')).toHaveCount(12);
  const beforePreference=await page.evaluate(()=>scrollY);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(grid).not.toHaveAttribute('data-motion','enabled');await expect(page.locator('.bento-particle,.bento-ripple')).toHaveCount(0);
  await expect(card).toHaveCSS('transform','none');
  expect(Math.abs((await page.evaluate(()=>scrollY))-beforePreference)).toBeLessThanOrEqual(2);
  await page.emulateMedia({reducedMotion:'no-preference'});await expect(grid).toHaveAttribute('data-motion','enabled');
  await page.mouse.move(5,200);
  await card.hover();await expect(card.locator('.bento-particle')).toHaveCount(12);
  await page.getByRole('link',{name:'联系客服',exact:true}).first().click();await expect(page).toHaveURL(/\/support$/);
  await expect(page.locator('.bento-spotlight,.bento-particle,.bento-ripple')).toHaveCount(0);expect(errors).toEqual([]);
});

test('reduced motion shows static support orb and visible showcase',async({page})=>{
  const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.locator('.orb-animated')).not.toBeVisible();await expect(page.locator('.orb-static')).toBeVisible();
  await expect(page.locator('#showcase')).toHaveCSS('opacity','1');
  expect(errors.filter(x=>x.includes('hydrated'))).toEqual([]);
});

test('server ignores tampered prices and protects private/admin routes',async({request})=>{
  const create=await request.post('/api/checkout',{headers:{Origin:'http://127.0.0.1:3001'},data:{plan:'extension',locale:'en',amount:1}});
  expect(create.status()).toBe(200);const {url}=await create.json();const token=url.split('/').pop();
  const order=await request.get(`/api/orders/${token}`);expect((await order.json()).amount).toBe(2499);
  expect((await request.get('/api/orders/not-a-token')).status()).toBe(404);
  expect((await request.get('/api/admin')).status()).toBe(401);
  expect((await request.post('/api/checkout',{headers:{Origin:'https://attacker.example'},data:{plan:'extension'}})).status()).toBe(403);
  expect((await request.post('/api/checkout',{headers:{Origin:'http://127.0.0.1:3001'},data:{plan:'combo'}})).status()).toBe(400);
});

test('complete extension checkout, create ticket, admin reply, resend and refund',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('vf-locale','en'));
  await page.goto('/');
  await page.locator('#pricing').getByRole('button',{name:'Get the extension'}).click();await expect(page).toHaveURL(/\/checkout\//);
  await page.getByLabel('Delivery email', {exact:true}).fill('browser-test@example.com');await page.getByRole('button',{name:'Simulate successful payment'}).click();
  await expect(page).toHaveURL(/\/order\//);await expect(page.getByRole('heading',{name:'Simulated payment complete'})).toBeVisible();
  const orderUrl=page.url();const reference=await page.getByTestId('ticket-reference').innerText();
  await page.getByRole('link',{name:/^Order support/}).click();await page.getByLabel('Subject',{exact:true}).fill('Browser test setup question');await page.getByLabel('Message',{exact:true}).fill('Please help me with the setup guide.');await page.getByRole('button',{name:'Create support ticket'}).click();
  await expect(page).toHaveURL(/\/support\/[a-f0-9]+/);await expect(page.getByRole('heading',{name:'Browser test setup question'})).toBeVisible();const ticketUrl=page.url();
  await page.goto('/admin/local');await page.getByLabel('Admin password',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:/^Sign in/}).click();await expect(page.locator('form').getByRole('alert')).toHaveText('Incorrect password, or your session has expired.');
  await page.getByLabel('Admin password',{exact:true}).fill('Vibeflow-Local-2026!');await page.getByRole('button',{name:/^Sign in/}).click();await expect(page.getByRole('heading',{name:'Your dashboard'})).toBeVisible();
  await page.getByRole('tab',{name:/Support tickets/}).click();await page.getByLabel('Search orders or tickets').fill('browser-test@example.com');await page.getByRole('button',{name:'View ticket'}).first().click();await page.getByLabel('Reply to customer',{exact:true}).fill('Your installation guide is ready. Follow the Windows steps.');await page.getByRole('button',{name:'Save reply'}).click();await expect(page.getByRole('status')).toHaveText('Saved.');
  await page.goto(ticketUrl);await expect(page.getByText('Your installation guide is ready. Follow the Windows steps.')).toBeVisible();
  await page.goto('/admin/local');await page.getByLabel('Search orders or tickets').fill(reference);await page.getByRole('button',{name:'Manage order'}).click();await page.getByLabel('Correct delivery email',{exact:true}).fill('corrected@example.com');await page.getByRole('button',{name:'Update & resend preview'}).click();await expect(page.getByRole('status')).toContainText('Delivery preview refreshed');await page.getByRole('button',{name:'Simulate refund'}).click();await expect(page.getByRole('status')).toContainText('Simulated order refunded');
  await page.goto(orderUrl);await expect(page.getByRole('heading',{name:'Order refunded'})).toBeVisible();await expect(page.locator('.delivery-preview')).toHaveCount(0);
});

test('paid orders show a localized receipt while pending orders keep the plain status card',async({page,request})=>{
  const paid=await createPaidOrder(request,'bundle');
  await page.goto(paid.url);
  const receipt=page.locator('.receipt-ticket');
  await expect(receipt).toBeVisible();await expect(receipt).toContainText(paid.reference);await expect(receipt).toContainText('RM 30.00');
  await expect(receipt).toHaveAttribute('data-animation-played','true');
  await expect(page.locator('.receipt-announcement')).toHaveAttribute('role','status');
  await expect(page.locator('.receipt-info-grid')).toContainText('r•••••@example.com');await expect(page.locator('.receipt-info-grid')).not.toContainText(paid.email);
  await expect(page.locator('.receipt-info-grid time')).toHaveAttribute('datetime',paid.paidAt);
  await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),`vf-receipt-viewed:${paid.reference}`)).toBe('1');
  await page.reload();const refreshedReceipt=page.locator('.receipt-ticket');await expect(refreshedReceipt).toHaveAttribute('data-animation-state','finished');await expect(refreshedReceipt).toHaveAttribute('data-animation-played','false');
  await page.goto(`${paid.url}?replay=1`);const replayReceipt=page.locator('.receipt-ticket');await expect(replayReceipt).toHaveAttribute('data-animation-played','true');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(replayReceipt).toHaveAttribute('data-animation-state','finished');await expect(page.locator('.receipt-confetti')).toHaveCount(0);
  const pending=await request.post('/api/checkout',{headers:{Origin:'http://127.0.0.1:3001'},data:{plan:'extension',locale:'zh'}});
  const {url}=await pending.json();await page.goto(url.replace('/checkout/','/order/'));
  await expect(page.locator('.receipt-ticket')).toHaveCount(0);await expect(page.locator('.order-plain-card')).toBeVisible();
});

test('paid receipt and delivery previews fit the requested viewports for each plan and locale',async({page,request})=>{
  test.setTimeout(300000);
  mkdirSync('.local/receipt-screenshots',{recursive:true});
  const plans=['bundle','extension','mobile_notification','mobile_notification_yearly'];
  const amounts:Record<string,string>={bundle:'30.00',extension:'24.99',mobile_notification:'11.99',mobile_notification_yearly:'19.99'};
  const locales=['zh','en'] as const;
  const desktopSizes=[[1366,768],[1440,900],[1536,864],[1920,1080]] as const;
  await page.addInitScript(()=>{const locale=new URL(location.href).searchParams.get('testLocale');if(locale==='zh'||locale==='en')localStorage.setItem('vf-locale',locale);});

  for(const locale of locales){
    for(const plan of plans){
      await page.setViewportSize({width:1366,height:768});
      const paid=await createPaidOrder(request,plan,locale);
      await page.goto(`${paid.url}?replay=1&testLocale=${locale}`);
      const expectedLanguage=locale==='zh'?'zh-CN':'en';
      await expect(page.locator('html')).toHaveAttribute('lang',expectedLanguage);
      const receipt=page.locator('.receipt-ticket');await expect(receipt).toBeVisible();
      await expect(receipt).toHaveAttribute('data-animation-state','finished');await expect(page.locator('.receipt-confetti')).toHaveCount(0);
      await expect(page.locator('.receipt-counted-amount')).toHaveText(`RM ${amounts[plan]}`);

      for(const [width,height] of desktopSizes){
        await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,0));
        const layout=await page.evaluate(()=>{
          const ticket=document.querySelector('.receipt-ticket')!.getBoundingClientRect();
          const delivery=document.querySelector('.order-delivery-column')!.getBoundingClientRect();
          return {pageHeight:document.documentElement.scrollHeight,viewport:innerHeight,ticketTop:ticket.top,ticketBottom:ticket.bottom,deliveryTop:delivery.top,deliveryBottom:delivery.bottom,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
        });
        expect(layout.pageHeight,`${locale}/${plan}/${width}x${height} should fit vertically`).toBeLessThanOrEqual(height+1);
        expect(layout.ticketTop).toBeGreaterThanOrEqual(84);expect(layout.ticketBottom).toBeLessThanOrEqual(height+1);
        expect(layout.deliveryTop).toBeGreaterThanOrEqual(84);expect(layout.deliveryBottom).toBeLessThanOrEqual(height+1);
        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
        await page.screenshot({path:`.local/receipt-screenshots/${locale}_${plan}_${width}x${height}.png`});
      }

      await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>window.scrollTo(0,0));
      for(const selector of ['.admit-one-ticket','[data-testid="receipt-paid-status"]','[data-testid="receipt-amount"]']){
        const bounds=await page.locator(selector).boundingBox();expect(bounds,`${locale}/${plan}/1280x720 ${selector}`).not.toBeNull();expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(720);
      }

      await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${locale}/${plan}/390px should not overflow horizontally`).toBe(true);
      await page.screenshot({path:`.local/receipt-screenshots/${locale}_${plan}_390x844.png`});
      await page.setViewportSize({width:360,height:800});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${locale}/${plan}/360px should not overflow horizontally`).toBe(true);
    }
  }
});

test('receipt entrance sequence can be captured in six frames',async({page,request})=>{
  test.setTimeout(30000);mkdirSync('.local/receipt-screenshots',{recursive:true});
  const paid=await createPaidOrder(request,'bundle');await page.goto(`${paid.url}?replay=1`);
  const frameDelays=[100,250,300,300,350,500];
  for(let index=0;index<frameDelays.length;index++){
    await page.waitForTimeout(frameDelays[index]);
    await page.locator('.receipt-stage').screenshot({path:`.local/receipt-screenshots/entrance-${String(index+1).padStart(2,'0')}.png`});
  }
});

test('mobile notifications use a DEMO key and cancelled checkout never delivers',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Switch to English'}).click();
  await page.locator('#pricing').getByRole('button',{name:'Enable mobile notifications · Yearly'}).click();await page.getByLabel('Delivery email',{exact:true}).fill('phone@example.com');await page.getByRole('button',{name:'Simulate successful payment'}).click();await expect(page.locator('.delivery-preview')).toContainText('DEMO-');
  await page.goto('/');await page.locator('#pricing').getByRole('button',{name:'Get the extension'}).click();await page.getByRole('button',{name:'Simulate cancelled payment'}).click();await expect(page.getByRole('heading',{name:'Payment cancelled'})).toBeVisible();await expect(page.locator('.delivery-preview')).toHaveCount(0);
});

test('hero recommends the complete bundle while keeping notification plans optional and keyboard-accessible',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Switch to English'}).click();
  const hero=page.locator('.hero-checkout');await expect(hero.getByRole('radio',{name:/Complete experience bundle/})).toHaveAttribute('aria-checked','true');
  await expect(hero).toContainText('RM 30.00');await expect(hero).toContainText('Extension + first semester notifications');
  await expect(hero.locator('.mini-bundle-original-price')).toHaveText('RM 35.00');
  await expect(hero.locator('.mini-bundle-promo')).toContainText('LIMITED-TIME DEAL');await expect(hero.locator('.mini-bundle-promo')).toContainText('Save RM 5.00');
  await expect(hero.locator('.mini-bundle-countdown')).toHaveText(/^\d+d \d{2}h \d{2}m \d{2}s$/);
  await hero.getByRole('button',{name:'Get complete bundle'}).click();await expect(page).toHaveURL(/\/checkout\//);await expect(page.locator('.order-total strong')).toHaveText('RM 30.00');
  await page.goto('/');const notificationHero=page.locator('.hero-checkout');await notificationHero.getByRole('radio',{name:/Mobile notifications/}).click();
  const tabs=notificationHero.getByRole('tablist').getByRole('tab');await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveText('Semester');await expect(tabs.nth(1)).toHaveText('Yearly');
  await expect(notificationHero).not.toContainText('Degree Pass');await expect(notificationHero).not.toContainText('RM 49.99');
  await tabs.nth(1).focus();await page.keyboard.press('ArrowRight');await expect(tabs.nth(0)).toHaveAttribute('aria-selected','true');
  await expect(notificationHero).toContainText('RM 11.99');
  await notificationHero.getByRole('button',{name:'Enable mobile notifications · Semester'}).click();await expect(page).toHaveURL(/\/checkout\//);await expect(page.locator('.order-total strong')).toHaveText('RM 11.99');
  await page.goto('/');const extensionHero=page.locator('.hero-checkout');await extensionHero.getByRole('radio',{name:/Browser extension/}).click();
  await expect(extensionHero.getByRole('tablist')).toHaveCount(0);await expect(extensionHero).toContainText('RM 24.99');
  await extensionHero.getByRole('button',{name:'Buy browser extension'}).click();await expect(page.locator('.order-total strong')).toHaveText('RM 24.99');
  await page.goto('/');await page.setViewportSize({width:390,height:844});const mobileHero=page.locator('.hero-checkout');await mobileHero.getByRole('radio',{name:/Mobile notifications/}).click();
  const mobileTabs=mobileHero.getByRole('tablist');for(const tab of await mobileTabs.getByRole('tab').all()){const bounds=await tab.boundingBox();expect(bounds?.height).toBeGreaterThanOrEqual(40);expect(await tab.evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});await mobileTabs.getByRole('tab',{name:'Yearly'}).focus();await page.keyboard.press('ArrowRight');await expect(mobileTabs.getByRole('tab',{name:'Semester'})).toHaveAttribute('aria-selected','true');
});test('long ticket subjects fit mobile and cancelled orders open usable support',async({page,request})=>{
  const subject='X'.repeat(120);
  const result=await request.post('/api/support',{headers:{Origin:'http://127.0.0.1:3001'},data:{email:'long-subject@example.com',reference:'',subject,message:'Test message for a long subject',locale:'en'}});
  expect(result.status()).toBe(200);const {url}=await result.json();
  await page.setViewportSize({width:390,height:844});await page.goto(url);
  await expect(page.getByRole('heading',{name:subject})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const checkout=await request.post('/api/checkout',{headers:{Origin:'http://127.0.0.1:3001'},data:{plan:'extension',locale:'en'}});const token=(await checkout.json()).url.split('/').pop();
  await request.post(`/api/orders/${token}`,{headers:{Origin:'http://127.0.0.1:3001'},data:{action:'cancel'}});
  await page.goto(`/order/${token}`);await page.getByRole('link',{name:'订单客服',exact:true}).click();
  await expect(page.locator('input[name=reference]')).toHaveValue('');
});
